// PDF templates for the generated CV and cover letter.
// Kept separate from docgenWorker so they can be rendered and tested without
// booting a BullMQ worker or a Redis connection.

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

export { esc, escList, buildContactLines, buildCVHTML, buildCoverLetterHTML };
