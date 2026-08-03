import { Worker } from 'bullmq';
import redis from '../config/redis.js';
import supabase from '../config/supabase.js';
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { buildCVHTML, buildCoverLetterHTML } from '../utils/documentTemplates.js';
import { uploadToBucket } from '../utils/storage.js';
import { workerLogger } from '../config/logger.js';
import { onCompleted, onFailed, onWorkerError } from '../utils/workerFailure.js';

// ── Fireworks AI Helper ───────────────────────────────────────────────────────
async function callFireworks(messages, options = {}) {
  const apiKey = process.env.FIREWORKS_KEY;
  if (!apiKey) throw new Error("FIREWORKS_KEY is not set in environment");

  const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "accounts/fireworks/models/kimi-k2p6",
      messages,
      temperature: options.temperature || 0.4,
      max_tokens: options.max_tokens || 4096,
      reasoning_effort: options.reasoning_effort || "low",
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Fireworks API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ── Generate tailored CV with Fireworks AI (One-Shot with Internal Reasoning) ─
async function generateTailoredCV(jobDescription, cvRawText) {
  console.log('[docgenWorker] Executing One-Shot JSON generation with internal reasoning...');
  const prompt = `You are an elite resume optimization engine.
Your task: rewrite a candidate's CV into a targeted, ATS-optimized, recruiter-compelling resume tailored to a specific job description.

INTERNAL PROCESS (do not output this):
- Identify the 3-5 core requirements of the job.
- Map which CV projects/experiences best address each requirement.
- Determine which keywords to front-load.
- Note all metrics that must be preserved.

OUTPUT PROCESS:
Using that analysis, rewrite the CV into the JSON schema below.

CORE RULES (follow all strictly)
1. Keyword Strategy
- Use EXACT keywords, phrases, and tools from the job description.
- Distribute keywords across summary, experience bullets, and skills.

2. Bullet Construction
- PRESERVE high-quality original bullets whenever possible. If the original bullet is strong, quantifiable, and relevant, keep it mostly intact.
- Focus on achievements over responsibilities. Ensure metrics (e.g., "90%") from the original CV are NEVER lost.
- Keep bullets concise but do not arbitrarily split them. 
- CRITICAL: Do not write generic summary bullets like "Built X using Y". Every bullet must be a unique, specific achievement.

3. Truth Constraint & Strict Structure
- NEVER fabricate roles, companies, dates, tools, or results.
- CRITICAL: Look at the headers in the provided CV. If there is NO header explicitly named "Work Experience" or "Experience", you MUST return "work_experience": []. Do NOT infer or invent work experience from the summary or projects.
- "Projects" stay strictly as projects. Do not duplicate them into work experience.
- You MUST include ALL projects listed in the original CV. Do not drop or omit any projects.

4. Formatting
- Professional Summary: Exactly 3 sentences. Opens with job title.
- You MUST output ONLY a valid JSON object starting with { and ending with }.
- CRITICAL: NO internal monologue, NO thought process, NO markdown formatting, NO conversational text. Just the raw JSON object. The first character of your response must be {, and the last character must be }.

JSON SCHEMA:
{
  "candidate_name": "string",
  "professional_summary": "string",
  "work_experience": [{"company": "string", "title": "string", "dates": "string", "bullets": ["string"]}],
  "skills": {"technical": ["string"], "tools": ["string"], "soft": ["string"]},
  "education": [{"institution": "string", "degree": "string", "dates": "string", "highlights": ["string"]}],
  "projects": [{"name": "string", "description": "string", "tech_stack": ["string"], "bullets": ["string"]}],
  "keywords_injected": ["string"],
  "ats_score_estimate": "integer"
}`;

  const executionMessages = [
    { role: 'system', content: prompt },
    { role: 'user', content: `JOB DESCRIPTION:\n${jobDescription}\n\nFULL CANDIDATE CV:\n${cvRawText || 'Not available'}` }
  ];

  const raw = await callFireworks(executionMessages, { temperature: 0.2, max_tokens: 4096, reasoning_effort: "medium" });

  try {
    return JSON.parse(raw);
  } catch {
    try {
      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
        } catch (e) {
          console.error('[docgenWorker] Sliced JSON parse failed. Raw Output:', raw);
          throw new Error("Could not parse JSON from CV output. See logs for raw output.");
        }
      }
      console.error('[docgenWorker] No JSON braces found. Raw Output:', raw);
      throw new Error("Could not parse JSON from CV output (no braces). See logs for raw output.");
    }
  }
}

// ── Generate cover letter with Fireworks AI ───────────────────────────────────
async function generateCoverLetter(jobDescription, tailoredCV, jobRecord) {
  const messages = [
    {
      role: 'system',
      content: `You are an expert cover letter writer. Write a compelling, authentic cover letter tailored to the job.
Rules:
- 3 paragraphs max
- Opening: hook + role name + why this company specifically
- Middle: 2-3 specific achievements from the CV that directly address job requirements
- Closing: confident call to action, no desperation
- Tone: professional but human — not robotic or sycophantic
- No "I am writing to apply for" openers
- No fabrication — only use what is in the CV

Return JSON only:
{
  "subject": "string",
  "body": "string (full cover letter, paragraphs separated by \\n\\n)"
}`,
    },
    {
      role: 'user',
      content: `JOB TITLE: ${jobRecord.title}\nCOMPANY: ${jobRecord.company}\n\nJOB DESCRIPTION:\n${jobDescription.slice(0, 1500)}\n\nCANDIDATE SUMMARY:\n${tailoredCV.professional_summary || 'Summary not provided'}\n\nKEY EXPERIENCE / PROJECTS:\n${tailoredCV.work_experience?.length ? tailoredCV.work_experience.map((w) => `${w.title} at ${w.company}\n${w.bullets?.join('\n')}`).join('\n\n') : (tailoredCV.projects || []).map((p) => `${p.name}\n${p.bullets?.join('\n')}`).join('\n\n')}`,
    },
  ];

  const raw = await callFireworks(messages, { temperature: 0.4, max_tokens: 4096, reasoning_effort: "low" });

  try {
    return JSON.parse(raw);
  } catch {
    try {
      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      }
      throw new Error("Could not parse JSON from Cover Letter output");
    }
  }
}


// ── Render HTML to PDF with Puppeteer ────────────────────────────────────────
// Resolve a Chrome binary: explicit env var wins, otherwise probe the usual
// install locations per platform. puppeteer-core ships no browser of its own.
function resolveChromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;

  const candidates = {
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    linux: [
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/opt/pw-browsers/chromium',
    ],
  }[process.platform] || [];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      'No Chrome binary found. Set PUPPETEER_EXECUTABLE_PATH to your Chrome/Chromium install.',
    );
  }
  return found;
}

async function htmlToPDF(html, margins) {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: resolveChromePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: margins,
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

// Storage is private — we persist the object path and mint short-lived signed
// URLs at read time (see utils/storage.js). Persisting a URL would either be a
// permanent public link or an expired one.

// ── Worker ────────────────────────────────────────────────────────────────────
const docgenWorker = new Worker(
  'docgen-queue',
  async (job) => {
    const { job_id, cv_id, user_id } = job.data;

    console.log(`[docgenWorker] Starting docgen for job ${job_id} with CV ${cv_id}`);

    // Step 1: Fetch job + CV + the user's profile (contact details for the letterhead)
    const [
      { data: jobRecord, error: jobError },
      { data: cvRecord, error: cvError },
      { data: profile, error: profileError },
    ] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', job_id).single(),
      supabase.from('cvs').select('*').eq('id', cv_id).single(),
      supabase
        .from('users')
        .select('full_name, email, phone, linkedin_url, city, country')
        .eq('id', user_id)
        .single(),
    ]);

    if (jobError || !jobRecord) throw new Error(`Job ${job_id} not found`);
    if (cvError || !cvRecord) throw new Error(`CV ${cv_id} not found`);
    // A missing profile shouldn't sink the whole render — the header just degrades.
    if (profileError) {
      console.warn(`[docgenWorker] Could not load profile for ${user_id}: ${profileError.message}`);
    }
    const userProfile = profile || {};

    await supabase.from('jobs').update({ status: 'generating' }).eq('id', job_id);
    const sourceJobDescription = jobRecord.raw_description || jobRecord.description;

    // Step 2: Generate tailored CV
    if (!cvRecord.raw_text) throw new Error(`CV ${cv_id} has no raw text to process`);
    const tailoredCV = await generateTailoredCV(sourceJobDescription, cvRecord.raw_text);
    console.log(`[docgenWorker] Tailored CV generated — ATS: ${tailoredCV.ats_score_estimate}`);

    // Step 4: Generate cover letter
    const coverLetter = await generateCoverLetter(sourceJobDescription, tailoredCV, jobRecord);
    console.log(`[docgenWorker] Cover letter generated`);

    // Step 5: Build HTML
    const cvHTML = buildCVHTML(tailoredCV, userProfile, jobRecord);
    const clHTML = buildCoverLetterHTML(
      coverLetter,
      tailoredCV.candidate_name || userProfile.full_name || cvRecord.label,
      jobRecord,
      userProfile,
    );

    // Step 6: Render PDFs
    console.log(`[docgenWorker] Rendering PDFs...`);
    const [cvPDF, clPDF] = await Promise.all([
      htmlToPDF(cvHTML, { top: '40px', right: '52px', bottom: '40px', left: '52px' }),
      htmlToPDF(clHTML, { top: '60px', right: '72px', bottom: '60px', left: '72px' })
    ]);
    console.log(`[docgenWorker] PDFs rendered`);

    // Step 7: Upload to storage. The first path segment is the user id, which
    // is what the storage RLS policy checks.
    const timestamp = Date.now();
    const [cvPath, clPath] = await Promise.all([
      uploadToBucket(
        'documents',
        `${user_id}/${job_id}/tailored-cv-${timestamp}.pdf`,
        cvPDF,
        'application/pdf',
        { upsert: true },
      ),
      uploadToBucket(
        'documents',
        `${user_id}/${job_id}/cover-letter-${timestamp}.pdf`,
        clPDF,
        'application/pdf',
        { upsert: true },
      ),
    ]);
    console.log(`[docgenWorker] PDFs uploaded`);

    // Step 8: Save to documents table
    const { error: docError } = await supabase.from('documents').upsert({
      job_id,
      user_id,
      tailored_cv_path: cvPath,
      cover_letter_path: clPath,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'job_id,user_id' });
    if (docError) throw new Error(`Documents save failed: ${docError.message}`);

    // Step 9: Update job status
    await supabase.from('jobs').update({ status: 'ready' }).eq('id', job_id);

    console.log(`[docgenWorker] Job ${job_id} fully ready`);
  },
  {
    connection: redis,
    concurrency: 1, // Puppeteer is memory-heavy — keep low
  }
);

const log = workerLogger('docgen');

docgenWorker.on('completed', onCompleted(log));
// Same as scoring: a failure used to leave the job pinned at 'generating'.
docgenWorker.on('failed', onFailed({ log, table: 'jobs', idFrom: (data) => data.job_id }));
docgenWorker.on('error', onWorkerError(log));

// Exported for tests — the worker itself starts on import.
export { resolveChromePath };

export default docgenWorker;
