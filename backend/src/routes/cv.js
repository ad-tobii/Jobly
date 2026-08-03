import express from 'express';
import multer from 'multer';
import supabase from '../config/supabase.js';
import { cvQueue } from '../queues/index.js';
import auth from '../middleware/auth.js';
import Groq from 'groq-sdk';
import { asyncHandler, badRequest, notFound, ApiError } from '../middleware/respond.js';
import validate from '../middleware/validate.js';
import { ingestLimiter, generationLimiter } from '../middleware/rateLimit.js';
import {
  cvLabelSchema,
  cvPatchSchema,
  cvTextSchema,
  enhanceApplySchema,
  idParam,
} from '../schemas/index.js';
import { removeByPrefix, uploadToBucket } from '../utils/storage.js';

// Lazily constructed so this module imports without a populated environment.
let groqClient = null;
const getGroq = () => (groqClient ??= new Groq({ apiKey: process.env.GROQ_API_KEY }));

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const CV_COLUMNS =
  'id, label, source_type, status, quality_tier, quality_summary, rejection_reason, cv_health_score, cv_health_feedback, is_active, created_at';

const TERMINAL_CV_STATES = ['ready', 'failed', 'invalid', 'unsalvageable', 'needs_enhancement'];

/** Fetch a CV the caller owns, or throw 404. */
async function getOwnedCV(cvId, userId) {
  const { data, error } = await supabase
    .from('cvs')
    .select('*')
    .eq('id', cvId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound('CV not found');
  return data;
}

// ── POST /cv/upload — file upload ────────────────────────────────────────────
router.post(
  '/upload',
  auth,
  ingestLimiter,
  upload.single('cv'),
  validate({ body: cvLabelSchema }),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No file uploaded.');
    if (req.file.mimetype !== 'application/pdf') throw badRequest('Only PDF files are supported.');

    // Namespaced by user id — the storage policy keys off the first path segment.
    const path = `${req.user.id}/${Date.now()}-${req.file.originalname.replace(/[^\w.-]/g, '_')}`;
    await uploadToBucket('cvs', path, req.file.buffer, 'application/pdf');

    const { data: cv, error } = await supabase
      .from('cvs')
      .insert({
        user_id: req.user.id,
        label: req.body.label,
        raw_cv_path: path,
        source_type: 'file',
      })
      .select()
      .single();

    if (error) throw new ApiError(500, error.message);

    await cvQueue.add('process-cv', {
      cv_id: cv.id,
      user_id: req.user.id,
      source_type: 'file',
      file_buffer: req.file.buffer.toString('base64'),
      correlation_id: req.id,
    });

    req.log?.info({ cvId: cv.id }, 'queued CV processing');
    res.ok({ message: 'CV uploaded. Processing started.', cv_id: cv.id }, 202);
  }),
);

// ── POST /cv/text — text/paste input ─────────────────────────────────────────
router.post(
  '/text',
  auth,
  ingestLimiter,
  validate({ body: cvTextSchema }),
  asyncHandler(async (req, res) => {
    const { label, raw_text } = req.body;

    const { data: cv, error } = await supabase
      .from('cvs')
      .insert({ user_id: req.user.id, label, raw_text, source_type: 'text' })
      .select()
      .single();

    if (error) throw new ApiError(500, error.message);

    await cvQueue.add('process-cv', {
      cv_id: cv.id,
      user_id: req.user.id,
      source_type: 'text',
      raw_text,
      correlation_id: req.id,
    });

    req.log?.info({ cvId: cv.id }, 'queued CV processing');
    res.ok({ message: 'CV received. Processing started.', cv_id: cv.id }, 202);
  }),
);

// ── GET /cv ──────────────────────────────────────────────────────────────────
router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('cvs')
      .select(CV_COLUMNS)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw new ApiError(500, error.message);
    res.ok(data);
  }),
);

// ── PATCH /cv/:id — rename or toggle active ──────────────────────────────────
router.patch(
  '/:id',
  auth,
  validate({ params: idParam, body: cvPatchSchema }),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('cvs')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select(CV_COLUMNS)
      .maybeSingle();

    if (error) throw new ApiError(500, error.message);
    if (!data) throw notFound('CV not found');
    res.ok(data);
  }),
);

// ── DELETE /cv/:id — delete CV + its chunks ──────────────────────────────────
router.delete(
  '/:id',
  auth,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const cv = await getOwnedCV(req.params.id, req.user.id);

    const { error } = await supabase
      .from('cvs')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw new ApiError(500, error.message);

    // The row cascades to cv_chunks; the uploaded PDF has to go separately.
    if (cv.raw_cv_path) {
      await supabase.storage.from('cvs').remove([cv.raw_cv_path]);
    }

    res.ok({ message: 'CV deleted' });
  }),
);

// ── POST /cv/:id/enhance/questions ───────────────────────────────────────────
router.post(
  '/:id/enhance/questions',
  auth,
  generationLimiter,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const cv = await getOwnedCV(req.params.id, req.user.id);

    if (cv.status !== 'needs_enhancement') {
      throw badRequest('This CV is not awaiting enhancement.');
    }
    if (!cv.raw_text) throw badRequest('This CV has no text to work from.');

    const chat = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an expert CV coach. Analyse this CV and identify the
2-3 most impactful clarifying questions to ask the candidate
that would unlock meaningful improvements. Focus on gaps where
a specific answer would let you add quantified achievements,
expand vague experience, or surface hidden strengths.
Do NOT ask generic questions. Be specific to THIS CV.
Return ONLY valid JSON:
{
  "questions": [
    {
      "id": "q1",
      "question": "<specific question>",
      "context": "<one sentence: why this question matters for their CV>"
    }
  ]
}
Maximum 3 questions. Minimum 2.`,
        },
        { role: 'user', content: cv.raw_text.slice(0, 4000) },
      ],
      temperature: 0.3,
    });

    res.ok(JSON.parse(chat.choices[0].message.content.trim()));
  }),
);

// ── POST /cv/:id/enhance/apply ───────────────────────────────────────────────
router.post(
  '/:id/enhance/apply',
  auth,
  generationLimiter,
  validate({ params: idParam, body: enhanceApplySchema }),
  asyncHandler(async (req, res) => {
    const { questions, answers } = req.body;
    const cv = await getOwnedCV(req.params.id, req.user.id);
    if (!cv.raw_text) throw badRequest('This CV has no text to work from.');

    const qaContext = questions
      .map(
        (question) =>
          `Q: ${question.question}\nContext: ${question.context || ''}\nA: ${
            answers.find((answer) => answer.id === question.id)?.answer || 'No answer provided'
          }`,
      )
      .join('\n\n');

    const chat = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are an elite CV writer. You previously analysed a candidate's
CV and identified key areas for improvement. You asked targeted
clarifying questions and have received the candidate's answers.
Your task: rewrite and enhance the CV using the original content
plus the new information from the answers.

Rules:
- Preserve ALL existing experience, education, and skills
- Use the answers to add specificity, quantify achievements,
  and expand vague descriptions
- Do NOT fabricate anything not implied by the CV or answers
- Maintain the candidate's authentic voice
- Output the full enhanced CV as clean plain text
- Use clear section headers: SUMMARY, EXPERIENCE, SKILLS,
  PROJECTS, EDUCATION
- Return ONLY the enhanced CV text — no preamble, no explanation`,
        },
        {
          role: 'user',
          content: `ORIGINAL CV:\n${cv.raw_text}\n\nCLARIFYING QUESTIONS AND ANSWERS:\n${qaContext}\n\nRewrite and enhance this CV now.`,
        },
      ],
      temperature: 0.3,
    });

    const enhancedText = chat.choices[0].message.content.trim();

    await supabase
      .from('cvs')
      .update({
        raw_text: enhancedText,
        status: 'processing',
        quality_tier: null,
        quality_summary: null,
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    await supabase.from('cv_chunks').delete().eq('cv_id', req.params.id);

    await cvQueue.add('process-cv', {
      cv_id: req.params.id,
      user_id: req.user.id,
      source_type: 'text',
      raw_text: enhancedText,
      skip_quality_checks: true,
      correlation_id: req.id,
    });

    res.ok({ message: 'Enhancement applied. Processing started.' }, 202);
  }),
);

// ── POST /cv/:id/skip-enhancement ────────────────────────────────────────────
router.post(
  '/:id/skip-enhancement',
  auth,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const cv = await getOwnedCV(req.params.id, req.user.id);
    if (!cv.raw_text) throw badRequest('This CV has no text to work from.');

    await supabase
      .from('cvs')
      .update({ status: 'processing' })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    await supabase.from('cv_chunks').delete().eq('cv_id', req.params.id);

    await cvQueue.add('process-cv', {
      cv_id: req.params.id,
      user_id: req.user.id,
      source_type: 'text',
      raw_text: cv.raw_text,
      skip_quality_checks: true,
      correlation_id: req.id,
    });

    res.ok({ message: 'Proceeding with original CV.' }, 202);
  }),
);

// ── GET /cv/:id/status-stream — SSE real-time status streaming ───────────────
router.get('/:id/status-stream', auth, validate({ params: idParam }), async (req, res) => {
  const cvId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let heartbeat = null;

  const closeStream = async (channel) => {
    if (heartbeat) clearInterval(heartbeat);
    if (channel) await channel.unsubscribe();
    if (!res.writableEnded) setTimeout(() => res.end(), 50);
  };

  const sendState = (cvRecord) => {
    switch (cvRecord.status) {
      case 'invalid':
        return send({ status: 'invalid', rejection_reason: cvRecord.rejection_reason });
      case 'unsalvageable':
        return send({ status: 'unsalvageable', quality_summary: cvRecord.quality_summary });
      case 'needs_enhancement':
        return send({
          status: 'needs_enhancement',
          quality_tier: cvRecord.quality_tier,
          quality_summary: cvRecord.quality_summary,
        });
      case 'ready':
        return send({
          status: 'ready',
          cv_health_score: cvRecord.cv_health_score,
          cv_health_feedback: cvRecord.cv_health_feedback,
        });
      case 'failed':
        return send({ status: 'failed' });
      default:
        return send({
          status: cvRecord.status,
          cv_health_score: cvRecord.cv_health_score,
          cv_health_feedback: cvRecord.cv_health_feedback,
        });
    }
  };

  const { data: cv, error } = await supabase
    .from('cvs')
    .select('*')
    .eq('id', cvId)
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (error || !cv) {
    send({ status: 'failed' });
    return closeStream();
  }

  sendState(cv);
  if (TERMINAL_CV_STATES.includes(cv.status)) return closeStream();

  const channel = supabase
    .channel(`cv-status-${cvId}-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'cvs', filter: `id=eq.${cvId}` },
      (payload) => {
        sendState(payload.new);
        if (TERMINAL_CV_STATES.includes(payload.new.status)) closeStream(channel);
      },
    )
    .subscribe();

  heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': keep-alive\n\n');
  }, 25000);

  req.on('close', () => {
    if (heartbeat) clearInterval(heartbeat);
    channel.unsubscribe();
  });
});

export default router;
