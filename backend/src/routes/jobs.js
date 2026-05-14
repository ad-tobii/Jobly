import express from 'express';
import  supabase  from '../config/supabase.js';
import { scrapeQueue, scoreQueue } from '../queues/index.js';
import auth from '../middleware/auth.js';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const router = express.Router();

// ── POST /jobs/url — scrape + score against all CVs ──────────────────────────
router.post('/url', auth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!url.includes('linkedin.com/jobs'))
      return res.status(400).json({ error: 'Only LinkedIn job URLs are supported' });

    // Create job record in pending state
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: req.user.id,
        source_url: url,
        source_type: 'url',
        status: 'scraping',
      })
      .select()
      .single();

    if (jobError) throw jobError;

    // Queue scrape worker
    await scrapeQueue.add('scrape-job', {
      job_id: job.id,
      user_id: req.user.id,
      url,
    });

    res.status(202).json({ message: 'Job queued for scraping.', job_id: job.id });
  } catch (err) {
    console.error('POST /jobs/url error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /jobs/paste — paste job description directly ────────────────────────
router.post('/paste', auth, async (req, res) => {
  try {
    const { raw_text } = req.body;
    if (!raw_text || raw_text.trim().length < 100)
      return res.status(400).json({ error: 'Job text is too short' });

    let parsedJob = {
      title: 'Untitled Role',
      company: 'Unknown Company',
      location: null,
      description: raw_text
    };

    try {
      const chat = await groq.chat.completions.create({
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
}`
          },
          {
            role: 'user',
            content: raw_text.slice(0, 5000)
          }
        ],
        temperature: 0.1,
      });

      const extracted = JSON.parse(chat.choices[0].message.content.trim());
      if (extracted.title) parsedJob.title = extracted.title;
      if (extracted.company) parsedJob.company = extracted.company;
      if (extracted.location) parsedJob.location = extracted.location;
      if (extracted.description) parsedJob.description = extracted.description;
    } catch (err) {
      console.error('Groq job parsing failed, falling back to raw_text:', err.message);
    }

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: req.user.id,
        title: parsedJob.title,
        company: parsedJob.company,
        location: parsedJob.location,
        description: parsedJob.description,
        source_type: 'paste',
        status: 'scraped',
      })
      .select()
      .single();

    if (jobError) throw jobError;

    // Queue score worker directly (no scraping needed)
    await scoreQueue.add('score-job', {
      job_id: job.id,
      user_id: req.user.id,
    });

    res.status(202).json({ message: 'Job queued for scoring.', job_id: job.id });
  } catch (err) {
    console.error('POST /jobs/paste error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /jobs/:id/select-cv — user picks CV, triggers docgen ────────────────
router.post('/:id/select-cv', auth, async (req, res) => {
  try {
    const { cv_id } = req.body;
    if (!cv_id) return res.status(400).json({ error: 'cv_id is required' });

    // Fetch the job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (jobError || !job) return res.status(404).json({ error: 'Job not found' });

    // Fetch the specific CV match score
    const { data: match, error: matchError } = await supabase
      .from('job_cv_matches')
      .select('*')
      .eq('job_id', job.id)
      .eq('cv_id', cv_id)
      .single();

      console.log("this is the cv found: ",match);

    if (matchError || !match)
      return res.status(404).json({ error: 'No match score found for this CV. Score it first.' });

    // Update job with selected CV
    await supabase
      .from('jobs')
      .update({
        selected_cv_id: cv_id,
        match_score: match.score,
        match_reasoning: match.reasoning,
        gaps: match.gaps,
        status: match.score >= 70 ? 'generating' : 'low_match',
      })
      .eq('id', job.id);

    // Queue docgen if score is good enough
    if (match.score >= 70) {
      const { docgenQueue } = await import('../queues/index.js');
      await docgenQueue.add('generate-docs', {
        job_id: job.id,
        cv_id,
        user_id: req.user.id,
      });
      return res.json({ message: 'Docs generation started.', score: match.score });
    }

    res.json({
      message: 'CV selected but score is below threshold. You can still manually generate docs.',
      score: match.score,
    });
  } catch (err) {
    console.error('POST /jobs/:id/select-cv error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /jobs — list all jobs with optional filters ──────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { status, min_score } = req.query;

    let query = supabase
      .from('jobs')
      .select(`
        id, title, company, location, logo_url, source_type, source_url,
        match_score, status, selected_cv_id, created_at,
        job_cv_matches (cv_id, score, recommended)
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (min_score) query = query.gte('match_score', parseInt(min_score));

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('GET /jobs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /jobs/:id — single job + cv matches + documents ──────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const { data: job, error } = await supabase
      .from('jobs')
      .select(`
        *,
        job_cv_matches (cv_id, score, reasoning, gaps, recommended),
        documents (id, tailored_cv_url, cover_letter_url, generated_at)
      `)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !job) return res.status(404).json({ error: 'Job not found' });

    res.json(job);
  } catch (err) {
    console.error('GET /jobs/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /jobs/:id ──────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ message: 'Job deleted' });
  } catch (err) {
    console.error('DELETE /jobs/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /jobs/:id/status-stream — SSE real-time status streaming ─────────────
router.get('/:id/status-stream', auth, async (req, res) => {
  const jobId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', req.user.id)
    .single();

  if (error || !job) {
    res.end();
    return;
  }

  const sendTerminalState = async (currentJob) => {
    if (currentJob.status === 'recommended' || currentJob.status === 'low_match') {
      const { data: cvMatches } = await supabase
        .from('job_cv_matches')
        .select('*')
        .eq('job_id', jobId);
      send({ status: currentJob.status, job: currentJob, cv_matches: cvMatches || [] });
    } else if (currentJob.status === 'ready') {
      const { data: documents } = await supabase
        .from('documents')
        .select('tailored_cv_url, cover_letter_url')
        .eq('job_id', jobId)
        .single();
      send({ status: currentJob.status, job: currentJob, documents: documents || {} });
    } else {
      send({ status: currentJob.status, job: currentJob });
    }
  };

  if (['recommended', 'low_match', 'ready', 'failed'].includes(job.status)) {
    await sendTerminalState(job);
    res.end();
    return;
  }

  send({ status: job.status, job });

  const channel = supabase
    .channel(`job-status-${jobId}-${Date.now()}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'jobs',
      filter: `id=eq.${jobId}`,
    }, async (payload) => {
      const updatedJob = payload.new;
      if (['recommended', 'low_match', 'ready', 'failed'].includes(updatedJob.status)) {
        await sendTerminalState(updatedJob);
        channel.unsubscribe();
        res.end();
      } else {
        send({ status: updatedJob.status, job: updatedJob });
      }
    })
    .subscribe();

  req.on('close', () => {
    channel.unsubscribe();
  });
});

export default router;