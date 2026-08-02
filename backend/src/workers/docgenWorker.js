import { Worker } from 'bullmq';
import redis from '../config/redis.js';
import supabase from '../config/supabase.js';
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

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

// ── HTML escaping ─────────────────────────────────────────────────────────────
// Model output and user profile fields land directly in the PDF templates, so
// anything with an angle bracket or ampersand would silently break the layout.
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
}

const escList = (values) => (values || []).map(esc);

// ── Build the contact block from the user's profile ───────────────────────────
function buildContactLines(profile) {
  const place = [profile?.city, profile?.country].filter(Boolean).map(esc).join(', ');
  const reach = [profile?.email, profile?.phone].filter(Boolean).map(esc);
  const linkedin = profile?.linkedin_url ? esc(profile.linkedin_url) : '';

  const lines = [];
  if (place) lines.push(place);
  if (reach.length) lines.push(reach.join('&nbsp;&nbsp;•&nbsp;&nbsp;'));
  if (linkedin) lines.push(linkedin);
  return lines;
}

// ── Build CV HTML ─────────────────────────────────────────────────────────────
function buildCVHTML(cv, profile = {}, jobRecord = {}) {
  const skillsHTML = cv.skills ? `
    <section>
      <h2>Skills</h2>
      <div class="skills-container">
        ${cv.skills.technical?.length ? `
        <div class="skill-row">
          <span class="skill-label">Technical</span><div class="leader"></div><span class="skill-value">${escList(cv.skills.technical).join(', ')}</span>
        </div>` : ''}
        ${cv.skills.tools?.length ? `
        <div class="skill-row">
          <span class="skill-label">Tools</span><div class="leader"></div><span class="skill-value">${escList(cv.skills.tools).join(', ')}</span>
        </div>` : ''}
        ${cv.skills.soft?.length ? `
        <div class="skill-row">
          <span class="skill-label">Soft Skills</span><div class="leader"></div><span class="skill-value">${escList(cv.skills.soft).join(', ')}</span>
        </div>` : ''}
      </div>
    </section>` : '';

  const experienceHTML = cv.work_experience?.length ? `
    <section>
      <h2>Experience</h2>
      ${cv.work_experience.map((role) => `
        <div class="entry">
          <div class="entry-header">
            <div class="title-company">❖ <strong>${esc(role.title)}</strong>${role.company ? `, ${esc(role.company)}` : ''}</div>
            <div class="leader"></div>
            <div class="date">${esc(role.dates)}</div>
          </div>
          <ul>
            ${(role.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
    </section>` : '';

  const projectsHTML = cv.projects?.length ? `
    <section>
      <h2>Projects</h2>
      ${cv.projects.map((p) => `
        <div class="entry">
          <div class="entry-header">
            <div class="title-company">❖ <strong>${esc(p.name)}</strong>${p.tech_stack?.length ? ` | ${escList(p.tech_stack).join(', ')}` : ''}</div>
            <div class="leader"></div>
            <div class="date"></div>
          </div>
          ${p.description ? `<p class="project-desc">${esc(p.description)}</p>` : ''}
          <ul>
            ${(p.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
    </section>` : '';

  const educationHTML = cv.education?.length ? `
    <section>
      <h2>Education</h2>
      ${cv.education.map((edu) => `
        <div class="entry">
          <div class="entry-header">
            <div class="title-company">❖ <strong>${esc(edu.institution)}</strong></div>
            <div class="leader"></div>
            <div class="date">${esc(edu.dates)}</div>
          </div>
          <div class="degree-line">
            <em>${esc(edu.degree)}</em>
          </div>
          ${edu.highlights?.length ? `<ul>${edu.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        </div>
      `).join('')}
    </section>` : '';

  const candidateName = cv.candidate_name || profile?.full_name || 'Candidate';
  // The tailored CV targets one specific role — lead with that job's title.
  const professionLine = jobRecord?.title || '';
  const contactLines = buildContactLines(profile);

  const headerHTML = `
  <div class="header">
    <h1>${esc(candidateName)}</h1>
    ${professionLine ? `<div class="title">${esc(professionLine)}</div>` : ''}
    ${contactLines.length ? `<div class="contact">${contactLines.join('<br>')}</div>` : ''}
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Garamond', 'Times New Roman', Times, serif;
      font-size: 10.5pt;
      color: #000;
      background: #fff;
      /* padding handled by Puppeteer margins */
      line-height: 1.5;
    }
    .header {
      text-align: center;
      padding-bottom: 12px;
      border-bottom: 1px solid #000;
      margin-bottom: 15px;
    }
    .header h1 {
      font-size: 20pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 6px;
    }
    .header .title {
      font-size: 12pt;
      font-weight: bold;
      margin-bottom: 6px;
    }
    .header .contact {
      font-size: 10pt;
      color: #333;
      line-height: 1.4;
    }
    h2 {
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      text-align: center;
      text-decoration: underline;
      background-color: #f1f1f1;
      padding: 4px 0;
      margin-top: 18px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }
    .summary p { 
      text-align: justify; 
      margin-bottom: 10px;
    }
    .entry { 
      margin-bottom: 14px; 
      page-break-inside: avoid;
    }
    .entry-header {
      display: flex;
      align-items: flex-end;
      width: 100%;
      margin-bottom: 2px;
    }
    .title-company {
      font-size: 10.5pt;
      padding-right: 4px;
    }
    .title-company strong {
      font-weight: bold;
    }
    .leader {
      flex-grow: 1;
      border-bottom: 1.5px dotted #999;
      margin: 0 8px;
      position: relative;
      top: -4px;
    }
    .date {
      font-size: 10.5pt;
      white-space: nowrap;
    }
    .degree-line {
      margin-left: 18px; /* Align with text after ❖ */
      margin-bottom: 4px;
    }
    .project-desc {
      margin-left: 18px;
      font-style: italic;
      margin-bottom: 4px;
    }
    ul { 
      padding-left: 32px; 
    }
    li { 
      margin-bottom: 3px; 
      text-align: justify;
    }
    .skills-container {
      width: 100%;
    }
    .skill-row {
      display: flex;
      align-items: baseline;
      width: 100%;
      margin-bottom: 4px;
    }
    .skill-label {
      font-weight: bold;
      white-space: nowrap;
    }
    .skill-value {
      text-align: right;
    }
    .keywords {
      margin-top: 25px;
      padding-top: 8px;
      border-top: 1px solid #eee;
      font-size: 8pt;
      color: #999;
      text-align: center;
    }
  </style>
</head>
<body>
  ${headerHTML}
  ${cv.professional_summary ? `
  <section class="summary">
    <h2>Summary</h2>
    <p>${esc(cv.professional_summary)}</p>
  </section>` : ''}
  ${experienceHTML}
  ${projectsHTML}
  ${educationHTML}
  ${skillsHTML}
  ${cv.keywords_injected?.length ? `
  <div class="keywords">
    Keywords: ${escList(cv.keywords_injected).join(' · ')}
  </div>` : ''}
</body>
</html>`;
}

// ── Build Cover Letter HTML ───────────────────────────────────────────────────
function buildCoverLetterHTML(coverLetter, candidateName, jobRecord, profile = {}) {
  const date = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  const paragraphs = (coverLetter.body || '')
    .split('\n\n')
    .filter((p) => p.trim())
    .map((p) => `<p>${esc(p)}</p>`)
    .join('');
  const contactLines = buildContactLines(profile);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 11pt;
      color: #1a1a1a;
      background: #fff;
      /* padding handled by Puppeteer margins */
      line-height: 1.7;
    }
    .header {
      text-align: center;
      padding-bottom: 16px;
      border-bottom: 2.5px solid #1a56db;
      margin-bottom: 36px;
    }
    .header h1 { font-size: 20pt; font-weight: 700; color: #0f172a; }
    .header .contact { margin-top: 8px; font-size: 10pt; color: #374151; line-height: 1.5; }
    .meta { margin-bottom: 28px; font-size: 10.5pt; color: #374151; }
    .meta p { margin-bottom: 2px; }
    .subject { font-weight: 700; font-size: 11pt; color: #0f172a; margin-bottom: 24px; }
    .body p { margin-bottom: 16px; color: #374151; text-align: justify; }
    .sign-off { margin-top: 36px; font-size: 11pt; color: #374151; }
    .sign-off .name { margin-top: 8px; font-weight: 700; color: #0f172a; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${esc(candidateName || 'Candidate')}</h1>
    ${contactLines.length ? `<div class="contact">${contactLines.join('<br>')}</div>` : ''}
  </div>
  <div class="meta">
    <p>${esc(date)}</p>
    <p>Hiring Manager</p>
    ${jobRecord.company ? `<p>${esc(jobRecord.company)}</p>` : ''}
  </div>
  <div class="subject">Re: ${esc(coverLetter.subject || `Application for ${jobRecord.title || 'the advertised role'}`)}</div>
  <div class="body">${paragraphs}</div>
  <div class="sign-off">
    <p>Sincerely,</p>
    <p class="name">${esc(candidateName || 'Candidate')}</p>
  </div>
</body>
</html>`;
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

// ── Upload to Supabase storage ────────────────────────────────────────────────
async function uploadToStorage(buffer, path, contentType) {
  const { error } = await supabase.storage
    .from('documents')
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path);
  return publicUrl;
}

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

    // Step 7: Upload to storage
    const timestamp = Date.now();
    const [cvUrl, clUrl] = await Promise.all([
      uploadToStorage(cvPDF, `${user_id}/${job_id}/tailored-cv-${timestamp}.pdf`, 'application/pdf'),
      uploadToStorage(clPDF, `${user_id}/${job_id}/cover-letter-${timestamp}.pdf`, 'application/pdf'),
    ]);
    console.log(`[docgenWorker] PDFs uploaded`);

    // Step 8: Save to documents table
    const { error: docError } = await supabase.from('documents').upsert({
      job_id,
      user_id,
      tailored_cv_url: cvUrl,
      cover_letter_url: clUrl,
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

docgenWorker.on('completed', (job) => console.log(`[docgenWorker] Job ${job.id} done`));
docgenWorker.on('failed', (job, err) => console.error(`[docgenWorker] Job ${job.id} failed:`, err.message));
docgenWorker.on('error', (err) => console.error(`[docgenWorker] Worker error:`, err));

// Exported for tests — the worker itself starts on import.
export { esc, buildContactLines, buildCVHTML, buildCoverLetterHTML, resolveChromePath };

export default docgenWorker;
