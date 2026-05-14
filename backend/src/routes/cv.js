import express from 'express';
import multer from 'multer';
import  supabase  from '../config/supabase.js';
import  { cvQueue  } from '../queues/index.js';
import auth from '../middleware/auth.js';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /cv/upload — file upload
router.post('/upload', auth, upload.single('cv'), async (req, res) => {
  try {
    const { label } = req.body;
    if (!label) return res.status(400).json({ error: 'Label is required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (req.file.mimetype !== 'application/pdf')
      return res.status(400).json({ error: 'Only PDF files are supported' });

    // Upload to Supabase Storage
    const fileName = `${req.user.id}/${Date.now()}-${req.file.originalname}`;
    const { error: storageError } = await supabase.storage
      .from('cvs')
      .upload(fileName, req.file.buffer, { contentType: 'application/pdf' });

    if (storageError) throw storageError;

    const { data: { publicUrl } } = supabase.storage.from('cvs').getPublicUrl(fileName);

    // Create CV record
    const { data: cv, error: cvError } = await supabase
      .from('cvs')
      .insert({
        user_id: req.user.id,
        label,
        raw_cv_url: publicUrl,
        source_type: 'file',
      })
      .select()
      .single();

    if (cvError) throw cvError;

    // Queue the worker
    await cvQueue.add('process-cv', {
      cv_id: cv.id,
      user_id: req.user.id,
      source_type: 'file',
      file_buffer: req.file.buffer.toString('base64'),
    });

    res.status(202).json({ message: 'CV uploaded. Processing started.', cv_id: cv.id });
  } catch (err) {
    console.error('CV upload error:', err);
    res.status(500).json({ error: 'CV upload failed' });
  }
});

// POST /cv/text — text/paste input
router.post('/text', auth, async (req, res) => {
  try {
    const { label, raw_text } = req.body;
    if (!label) return res.status(400).json({ error: 'Label is required' });
    if (!raw_text || raw_text.trim().length < 100)
      return res.status(400).json({ error: 'CV text is too short' });

    const { data: cv, error: cvError } = await supabase
      .from('cvs')
      .insert({
        user_id: req.user.id,
        label,
        raw_text,
        source_type: 'text',
      })
      .select()
      .single();

    if (cvError) throw cvError;

    await cvQueue.add('process-cv', {
      cv_id: cv.id,
      user_id: req.user.id,
      source_type: 'text',
      raw_text,
    });

    res.status(202).json({ message: 'CV received. Processing started.', cv_id: cv.id });
  } catch (err) {
    console.error('CV text input error:', err);
    res.status(500).json({ error: 'CV text input failed' });
  }
});

// GET /cv — list all CVs for user
router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('cvs')
    .select('id, label, source_type, status, quality_tier, quality_summary, rejection_reason, cv_health_score, cv_health_feedback, is_active, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch CVs' });
  res.json(data);
});

// PATCH /cv/:id — rename or toggle active
router.patch('/:id', auth, async (req, res) => {
  const { label, is_active } = req.body;
  const updates = {};
  if (label !== undefined) updates.label = label;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from('cvs')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Update failed' });
  res.json(data);
});

// DELETE /cv/:id — delete CV + its chunks
router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase
    .from('cvs')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: 'Delete failed' });
  res.json({ message: 'CV deleted' });
});

// POST /cv/:id/enhance/questions
router.post('/:id/enhance/questions', auth, async (req, res) => {
  try {
    const { data: cv, error } = await supabase
      .from('cvs')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !cv) return res.status(404).json({ error: 'CV not found' });
    if (cv.status !== 'needs_enhancement') {
      return res.status(400).json({ error: 'CV is not in needs_enhancement state' });
    }

    const chat = await groq.chat.completions.create({
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
Maximum 3 questions. Minimum 2.`
        },
        {
          role: 'user',
          content: cv.raw_text.slice(0, 4000)
        }
      ],
      temperature: 0.3,
    });

    const result = JSON.parse(chat.choices[0].message.content.trim());
    res.json(result);
  } catch (err) {
    console.error('Enhance questions error:', err);
    res.status(500).json({ error: 'Failed to generate enhancement questions' });
  }
});

// POST /cv/:id/enhance/apply
router.post('/:id/enhance/apply', auth, async (req, res) => {
  try {
    const { questions, answers } = req.body;
    if (!Array.isArray(questions) || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Questions and answers must be arrays' });
    }

    const { data: cv, error } = await supabase
      .from('cvs')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !cv) return res.status(404).json({ error: 'CV not found' });

    const qaContext = questions.map((q, i) => 
      `Q: ${q.question}\nContext: ${q.context}\nA: ${answers.find(a => a.id === q.id)?.answer || 'No answer provided'}`
    ).join('\n\n');

    const chat = await groq.chat.completions.create({
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
- Return ONLY the enhanced CV text — no preamble, no explanation`
        },
        {
          role: 'user',
          content: `ORIGINAL CV:\n${cv.raw_text}\n\nCLARIFYING QUESTIONS AND ANSWERS:\n${qaContext}\n\nRewrite and enhance this CV now.`
        }
      ],
      temperature: 0.3,
    });

    const enhancedText = chat.choices[0].message.content.trim();

    await supabase.from('cvs').update({
      raw_text: enhancedText,
      status: 'processing',
      quality_tier: null,
      quality_summary: null
    }).eq('id', req.params.id);

    await supabase.from('cv_chunks').delete().eq('cv_id', req.params.id);

    await cvQueue.add('process-cv', {
      cv_id: req.params.id,
      user_id: req.user.id,
      source_type: 'text',
      raw_text: enhancedText,
      skip_quality_checks: true,
    });

    res.status(202).json({ message: 'Enhancement applied. Processing started.' });
  } catch (err) {
    console.error('Enhance apply error:', err);
    res.status(500).json({ error: 'Failed to apply enhancements' });
  }
});

// POST /cv/:id/skip-enhancement
router.post('/:id/skip-enhancement', auth, async (req, res) => {
  try {
    const { data: cv, error } = await supabase
      .from('cvs')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !cv) return res.status(404).json({ error: 'CV not found' });

    await supabase.from('cvs').update({ status: 'processing' }).eq('id', req.params.id);
    await supabase.from('cv_chunks').delete().eq('cv_id', req.params.id);

    await cvQueue.add('process-cv', {
      cv_id: req.params.id,
      user_id: req.user.id,
      source_type: 'text',
      raw_text: cv.raw_text,
      skip_quality_checks: true,
    });

    res.status(202).json({ message: 'Proceeding with original CV.' });
  } catch (err) {
    console.error('Skip enhancement error:', err);
    res.status(500).json({ error: 'Failed to skip enhancement' });
  }
});

// GET /cv/:id/status-stream — SSE real-time status streaming
router.get('/:id/status-stream', auth, async (req, res) => {
  const cvId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  const closeStream = async (channel) => {
    if (channel) await channel.unsubscribe();
    if (!res.writableEnded) {
      setTimeout(() => res.end(), 50);
    }
  };

  const sendTerminalState = (cvRecord) => {
    switch (cvRecord.status) {
      case 'invalid':
        send({ status: 'invalid', rejection_reason: cvRecord.rejection_reason });
        break;
      case 'unsalvageable':
        send({ status: 'unsalvageable', quality_summary: cvRecord.quality_summary });
        break;
      case 'needs_enhancement':
        send({ 
          status: 'needs_enhancement', 
          quality_tier: cvRecord.quality_tier,
          quality_summary: cvRecord.quality_summary 
        });
        break;
      case 'ready':
        send({ 
          status: 'ready', 
          cv_health_score: cvRecord.cv_health_score, 
          cv_health_feedback: cvRecord.cv_health_feedback 
        });
        break;
      case 'failed':
        send({ status: 'failed' });
        break;
      default:
        send({ status: cvRecord.status, cv_health_score: cvRecord.cv_health_score, cv_health_feedback: cvRecord.cv_health_feedback });
    }
  };

  const terminalStates = ['ready', 'failed', 'invalid', 'unsalvageable', 'needs_enhancement'];

  const { data: cv, error } = await supabase
    .from('cvs')
    .select('*')
    .eq('id', cvId)
    .eq('user_id', req.user.id)
    .single();

  if (error || !cv) {
    send({ status: 'failed' });
    await closeStream();
    return;
  }

  sendTerminalState(cv);

  if (terminalStates.includes(cv.status)) {
    await closeStream();
    return;
  }

  const channel = supabase
    .channel(`cv-status-${cvId}-${Date.now()}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'cvs',
      filter: `id=eq.${cvId}`,
    }, (payload) => {
      const updatedCv = payload.new;
      sendTerminalState(updatedCv);

      if (terminalStates.includes(updatedCv.status)) {
        closeStream(channel);
      }
    })
    .subscribe();

  req.on('close', () => {
    channel.unsubscribe();
  });
});

export default router;
