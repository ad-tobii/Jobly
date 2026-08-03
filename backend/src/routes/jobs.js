import express from 'express';
import supabase from '../config/supabase.js';
import { scrapeQueue, scoreQueue, docgenQueue } from '../queues/index.js';
import auth from '../middleware/auth.js';
import Groq from 'groq-sdk';
import { formatJobForRendering } from '../utils/jobFormatter.js';
import { asyncHandler, notFound, ApiError } from '../middleware/respond.js';
import validate from '../middleware/validate.js';
import { ingestLimiter, generationLimiter } from '../middleware/rateLimit.js';
import {
  dashboardQuerySchema,
  idParam,
  jobListQuerySchema,
  jobPasteSchema,
  jobUrlSchema,
  selectCvSchema,
} from '../schemas/index.js';
import {
  removeByPrefix,
  signPaths,
  withSignedJobDocuments,
  withSignedJobDocumentsMany,
} from '../utils/storage.js';

// Constructed on first use — the SDK throws when the key is absent, which would
// make this module unimportable in tests.
let groqClient = null;
const getGroq = () => (groqClient ??= new Groq({ apiKey: process.env.GROQ_API_KEY }));

const router = express.Router();

const SCORING_STATUSES = ['scraping', 'scraped', 'scoring', 'generating'];
const TERMINAL_STATUSES = ['recommended', 'low_match', 'ready', 'failed'];

const JOB_LIST_COLUMNS = `
  id, title, company, location, logo_url, source_type, source_url,
  match_score, status, selected_cv_id, created_at, updated_at,
  job_cv_matches (cv_id, score, recommended)
`;

function getTimelineStart(timeline) {
  const now = new Date();
  if (timeline === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (timeline === 'weekly') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return start.toISOString();
  }
  if (timeline === 'monthly') {
    const start = new Date(now);
    start.setMonth(now.getMonth() - 1);
    return start.toISOString();
  }
  return null;
}

function applyDashboardScope(query, userId, since) {
  const scoped = query.eq('user_id', userId);
  return since ? scoped.gte('created_at', since) : scoped;
}

/** Best-effort structured extraction from a pasted posting. */
async function parsePastedJob(rawText, log) {
  const fallback = {
    title: 'Untitled Role',
    company: 'Unknown Company',
    location: null,
    description: rawText,
  };

  try {
    const chat = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a job posting parser. Extract structured fields from
this job posting text.
Return ONLY valid JSON:
{
  "title": "string or null",
  "company": "string or null",
  "location": "string or null",
  "description": "string (full cleaned job description)"
}`,
        },
        { role: 'user', content: rawText.slice(0, 5000) },
      ],
      temperature: 0.1,
    });

    const extracted = JSON.parse(chat.choices[0].message.content.trim());
    return {
      title: extracted.title || fallback.title,
      company: extracted.company || fallback.company,
      location: extracted.location || fallback.location,
      description: extracted.description || fallback.description,
    };
  } catch (err) {
    log?.warn({ err: err.message }, 'job parsing failed, using raw text');
    return fallback;
  }
}

// ── POST /jobs/url — scrape + score against all CVs ──────────────────────────
router.post(
  '/url',
  auth,
  ingestLimiter,
  validate({ body: jobUrlSchema }),
  asyncHandler(async (req, res) => {
    const { url } = req.body;

    // The same posting twice is almost always a mistake, and re-scraping costs
    // a scrape plus a full scoring pass.
    const { data: existing } = await supabase
      .from('jobs')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('source_url', url)
      .maybeSingle();

    if (existing) {
      return res.ok({ message: 'You already added this job.', job_id: existing.id, duplicate: true });
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({ user_id: req.user.id, source_url: url, source_type: 'url', status: 'scraping' })
      .select()
      .single();

    if (error) throw new ApiError(500, error.message);

    await scrapeQueue.add('scrape-job', {
      job_id: job.id,
      user_id: req.user.id,
      url,
      correlation_id: req.id,
    });

    req.log?.info({ jobId: job.id }, 'queued job scrape');
    res.ok({ message: 'Job queued for scraping.', job_id: job.id }, 202);
  }),
);

// ── POST /jobs/paste — paste job description directly ────────────────────────
router.post(
  '/paste',
  auth,
  ingestLimiter,
  validate({ body: jobPasteSchema }),
  asyncHandler(async (req, res) => {
    const { raw_text } = req.body;

    const parsedJob = await parsePastedJob(raw_text, req.log);
    const renderSections = await formatJobForRendering(parsedJob);

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        user_id: req.user.id,
        title: parsedJob.title,
        company: parsedJob.company,
        location: parsedJob.location,
        description: parsedJob.description,
        raw_description: parsedJob.description,
        render_description: renderSections,
        source_type: 'paste',
        status: 'scraped',
      })
      .select()
      .single();

    if (error) throw new ApiError(500, error.message);

    await scoreQueue.add('score-job', {
      job_id: job.id,
      user_id: req.user.id,
      correlation_id: req.id,
    });

    req.log?.info({ jobId: job.id }, 'queued job scoring');
    res.ok({ message: 'Job queued for scoring.', job_id: job.id }, 202);
  }),
);

// ── GET /jobs/dashboard — summary cards + visible pipeline rows ─────────────
router.get(
  '/dashboard',
  auth,
  validate({ query: dashboardQuerySchema }),
  asyncHandler(async (req, res) => {
    const { timeline } = req.query;
    const since = getTimelineStart(timeline);

    const countJobs = (builder) =>
      applyDashboardScope(
        builder(supabase.from('jobs').select('id', { count: 'exact', head: true })),
        req.user.id,
        since,
      );

    const [totalResult, recommendedResult, readyResult, appliedResult, scoringResult, jobsResult] =
      await Promise.all([
        countJobs((query) => query),
        countJobs((query) => query.eq('status', 'recommended')),
        countJobs((query) => query.eq('status', 'ready')),
        countJobs((query) => query.eq('status', 'applied')),
        countJobs((query) => query.in('status', SCORING_STATUSES)),
        applyDashboardScope(
          supabase
            .from('jobs')
            .select(`${JOB_LIST_COLUMNS}, documents (id, tailored_cv_path, cover_letter_path)`)
            .order('created_at', { ascending: false })
            .limit(25),
          req.user.id,
          since,
        ),
      ]);

    const firstError = [
      totalResult,
      recommendedResult,
      readyResult,
      appliedResult,
      scoringResult,
      jobsResult,
    ].find((result) => result.error)?.error;

    if (firstError) throw new ApiError(500, firstError.message);

    res.ok({
      timeline,
      stats: {
        total_jobs: totalResult.count || 0,
        recommended: recommendedResult.count || 0,
        ready: readyResult.count || 0,
        applied: appliedResult.count || 0,
        scoring: scoringResult.count || 0,
      },
      jobs: await withSignedJobDocumentsMany(jobsResult.data || []),
    });
  }),
);

// ── POST /jobs/:id/select-cv — user picks CV, triggers docgen ────────────────
router.post(
  '/:id/select-cv',
  auth,
  generationLimiter,
  validate({ params: idParam, body: selectCvSchema }),
  asyncHandler(async (req, res) => {
    const { cv_id } = req.body;

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (jobError) throw new ApiError(500, jobError.message);
    if (!job) throw notFound('Job not found');

    const { data: match, error: matchError } = await supabase
      .from('job_cv_matches')
      .select('*')
      .eq('job_id', job.id)
      .eq('cv_id', cv_id)
      .maybeSingle();

    if (matchError) throw new ApiError(500, matchError.message);
    if (!match) throw notFound('No match score found for this CV. Score it first.');

    // Manual user selection always starts document generation. The low-match
    // brake belongs to unattended automation, not explicit user action.
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        selected_cv_id: cv_id,
        match_score: match.score,
        match_reasoning: match.reasoning,
        gaps: match.gaps,
        status: 'generating',
      })
      .eq('id', job.id)
      .eq('user_id', req.user.id);

    if (updateError) throw new ApiError(500, updateError.message);

    await docgenQueue.add('generate-docs', {
      job_id: job.id,
      cv_id,
      user_id: req.user.id,
      correlation_id: req.id,
    });

    req.log?.info({ jobId: job.id, cvId: cv_id, score: match.score }, 'queued docgen');
    res.ok({ message: 'Docs generation started.', score: match.score }, 202);
  }),
);

// ── GET /jobs — list all jobs with optional filters ──────────────────────────
router.get(
  '/',
  auth,
  validate({ query: jobListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { status, min_score } = req.query;

    let query = supabase
      .from('jobs')
      .select(JOB_LIST_COLUMNS)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (min_score !== undefined) query = query.gte('match_score', min_score);

    const { data, error } = await query;
    if (error) throw new ApiError(500, error.message);

    res.ok(data);
  }),
);

// ── GET /jobs/:id — single job + cv matches + documents ──────────────────────
router.get(
  '/:id',
  auth,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { data: job, error } = await supabase
      .from('jobs')
      .select(`
        *,
        job_cv_matches (cv_id, score, reasoning, gaps, summary, recommended),
        documents (id, tailored_cv_path, cover_letter_path, generated_at)
      `)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw new ApiError(500, error.message);
    if (!job) throw notFound('Job not found');

    res.ok(await withSignedJobDocuments(job));
  }),
);

// ── DELETE /jobs/:id ─────────────────────────────────────────────────────────
router.delete(
  '/:id',
  auth,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select('id')
      .maybeSingle();

    if (error) throw new ApiError(500, error.message);
    if (!data) throw notFound('Job not found');

    // Cascading deletes clear the rows; the PDFs need removing separately or
    // they linger in the bucket forever.
    await removeByPrefix('documents', `${req.user.id}/${req.params.id}`);

    res.ok({ message: 'Job deleted' });
  }),
);

// ── GET /jobs/:id/status-stream — SSE real-time status streaming ─────────────
router.get('/:id/status-stream', auth, validate({ params: idParam }), async (req, res) => {
  const jobId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (error || !job) {
    send({ status: 'failed', error: 'Job not found' });
    return res.end();
  }

  const sendTerminalState = async (currentJob) => {
    if (currentJob.status === 'recommended' || currentJob.status === 'low_match') {
      const { data: cvMatches } = await supabase
        .from('job_cv_matches')
        .select('*')
        .eq('job_id', jobId);
      send({ status: currentJob.status, job: currentJob, cv_matches: cvMatches || [] });
      return;
    }

    if (currentJob.status === 'ready') {
      const { data: documents } = await supabase
        .from('documents')
        .select('tailored_cv_path, cover_letter_path')
        .eq('job_id', jobId)
        .maybeSingle();

      const signed = await signPaths('documents', [
        documents?.tailored_cv_path,
        documents?.cover_letter_path,
      ]);

      send({
        status: currentJob.status,
        job: currentJob,
        documents: {
          tailored_cv_url: signed[documents?.tailored_cv_path] ?? null,
          cover_letter_url: signed[documents?.cover_letter_path] ?? null,
        },
      });
      return;
    }

    send({ status: currentJob.status, job: currentJob });
  };

  if (TERMINAL_STATUSES.includes(job.status)) {
    await sendTerminalState(job);
    return res.end();
  }

  send({ status: job.status, job });

  const channel = supabase
    .channel(`job-status-${jobId}-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
      async (payload) => {
        const updatedJob = payload.new;
        if (TERMINAL_STATUSES.includes(updatedJob.status)) {
          await sendTerminalState(updatedJob);
          channel.unsubscribe();
          res.end();
        } else {
          send({ status: updatedJob.status, job: updatedJob });
        }
      },
    )
    .subscribe();

  // Proxies commonly drop an idle connection after ~60s; a comment frame keeps
  // it warm without the client seeing anything.
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    channel.unsubscribe();
  });
});

export default router;
