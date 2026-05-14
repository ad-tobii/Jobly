import { Worker } from 'bullmq';
import redis from '../config/redis.js';
import supabase  from '../config/supabase.js';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Embed via Supabase edge function ─────────────────────────────────────────
async function embedText(text) {
  const { data, error } = await supabase.functions.invoke('embed', {
    body: { input: text },
  });
  if (error) throw new Error(`Embedding failed: ${error.message}`);
  return data.embedding;
}

// ── RAG: pull top matching chunks for a cv against a job embedding ────────────
async function matchChunks(jobEmbedding, userId, cvId, matchCount = 8) {
  const { data, error } = await supabase.rpc('match_cv_chunks', {
    query_embedding: jobEmbedding,
    match_user_id: userId,
    match_cv_id: cvId,
    match_count: matchCount,
  });

  if (error) throw new Error(`match_cv_chunks RPC failed: ${error.message}`);
  return data; // [{ id, content, section_type, similarity }]
}

// ── Extract core requirements from Job Description for better RAG matching ─────
async function extractJobRequirements(jobDescription) {
  const chat = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are an expert technical recruiter. Extract a concise list of the core required skills, technologies, and experience levels from the job description. Return only a comma-separated list of keywords and short phrases. No fluff, no company description.`,
      },
      {
        role: 'user',
        content: `Extract requirements from this JD:\n\n${jobDescription}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 300,
  });
  return chat.choices[0].message.content.trim();
}

// ── Score match with Groq ─────────────────────────────────────────────────────
async function scoreMatchWithGroq(jobDescription, chunks) {
  const cvContext = chunks
    .map((c) => `[${c.section_type.toUpperCase()}]\n${c.content}`)
    .join('\n\n');

  const chat = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are a senior technical recruiter evaluating how well a candidate's CV matches a job description.
Return ONLY valid JSON — no preamble, no markdown fences, no explanation.
Return exactly this shape:
{
  "score": <integer 0-100>,
  "reasoning": {
    "strengths": ["<why they're a good match>", "..."],
    "weaknesses": ["<where they fall short>", "..."]
  },
  "gaps": ["<missing skill or experience>", "..."],
  "summary": "<2 sentence overall assessment>"
}`,
      },
      {
        role: 'user',
        content: `JOB DESCRIPTION:\n${jobDescription}\n\nCANDIDATE CV EXCERPTS:\n${cvContext}`,
      },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const raw = chat.choices[0].message.content.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────
const scoreWorker = new Worker(
  'score-queue',
  async (job) => {
    const { job_id, user_id } = job.data;

    console.log(`[scoreWorker] Scoring job ${job_id}`);

    // ── Step 1: Fetch job ─────────────────────────────────────────────────────
    const { data: jobRecord, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', job_id)
      .single();

    if (jobError || !jobRecord) throw new Error(`Job ${job_id} not found`);
    if (!jobRecord.description) throw new Error(`Job ${job_id} has no description to score against`);

    await supabase.from('jobs').update({ status: 'scoring' }).eq('id', job_id);

    // ── Step 2: Fetch all active CVs for user ─────────────────────────────────
    const { data: cvs, error: cvsError } = await supabase
      .from('cvs')
      .select('id, label')
      .eq('user_id', user_id)
      .eq('is_active', true);

    if (cvsError) throw new Error(`Failed to fetch CVs: ${cvsError.message}`);
    if (!cvs || cvs.length === 0) throw new Error(`No active CVs found for user ${user_id}`);

    console.log(`[scoreWorker] Scoring against ${cvs.length} CV(s)`);

    // ── Step 3: Extract keywords and embed them ───────────────────────────────
    console.log(`[scoreWorker] Extracting requirements for better RAG match...`);
    const jobRequirements = await extractJobRequirements(jobRecord.description);
    console.log(`[scoreWorker] Extracted requirements: ${jobRequirements}`);
    const jobEmbedding = await embedText(jobRequirements);

    // ── Step 4: Score each CV in parallel ────────────────────────────────────
    const matchResults = await Promise.all(
      cvs.map(async (cv) => {
        try {
          // RAG pull
          const chunks = await matchChunks(jobEmbedding, user_id, cv.id);

          if (!chunks || chunks.length === 0) {
            console.warn(`[scoreWorker] No chunks found for CV ${cv.id}`);
            return { cv_id: cv.id, label: cv.label, score: 0, reasoning: {}, gaps: [] };
          }

          // Groq score
          const result = await scoreMatchWithGroq(jobRecord.description, chunks);

          return {
            cv_id: cv.id,
            label: cv.label,
            score: result.score,
            reasoning: result.reasoning,
            gaps: result.gaps,
            summary: result.summary,
          };
        } catch (err) {
          console.error(`[scoreWorker] Failed to score CV ${cv.id}:`, err.message);
          return { cv_id: cv.id, label: cv.label, score: 0, reasoning: {}, gaps: [], error: err.message };
        }
      })
    );

    // ── Step 5: Sort and mark recommended ────────────────────────────────────
    matchResults.sort((a, b) => b.score - a.score);
    const topScore = matchResults[0].score;

    // ── Step 6: Upsert into job_cv_matches ───────────────────────────────────
    const matchRows = matchResults.map((m) => ({
      job_id,
      cv_id: m.cv_id,
      score: m.score,
      reasoning: m.reasoning,
      gaps: m.gaps,
      summary: m.summary,
      recommended: m.score >= 80, // >= 80 is recommended
    }));

    const { error: matchError } = await supabase
      .from('job_cv_matches')
      .upsert(matchRows, { onConflict: 'job_id,cv_id' });

    if (matchError) throw new Error(`job_cv_matches upsert failed: ${matchError.message}`);

    // ── Step 7: Update job status ─────────────────────────────────────────────
    await supabase
      .from('jobs')
      .update({
        status: topScore >= 70 ? 'recommended' : 'low_match',
      })
      .eq('id', job_id);

    console.log(
      `[scoreWorker] Job ${job_id} scored ✓ | Top: ${matchResults[0].label} — ${topScore}/100`
    );
    matchResults.forEach((m) => {
      console.log(`  → ${m.label}: ${m.score}/100${m.recommended ? ' ⭐ recommended' : ''}`);
    });
  },
  {
    connection: redis,
    concurrency: 2,
  }
);

scoreWorker.on('completed', (job) => console.log(`[scoreWorker] Job ${job.id} done`));
scoreWorker.on('failed', (job, err) => console.error(`[scoreWorker] Job ${job.id} failed:`, err.message));
scoreWorker.on('error', (err) => console.error(`[scoreWorker] Worker error:`, err));

export default scoreWorker;