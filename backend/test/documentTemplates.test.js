import test from 'node:test';
import assert from 'node:assert/strict';

import {
  esc,
  escList,
  buildContactLines,
  buildCVHTML,
  buildCoverLetterHTML,
} from '../src/utils/documentTemplates.js';

const PROFILE = {
  full_name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+44 7000 000000',
  linkedin_url: 'linkedin.com/in/ada',
  city: 'London',
  country: 'United Kingdom',
};

const CV = {
  candidate_name: 'Ada Lovelace',
  professional_summary: 'Analytical engine specialist.',
  work_experience: [
    { company: 'Analytical Engine Co', title: 'Lead Engineer', dates: '1842–1843', bullets: ['Wrote the first algorithm'] },
  ],
  skills: { technical: ['Mathematics'], tools: ['Punch cards'], soft: ['Collaboration'] },
  education: [{ institution: 'Private tuition', degree: 'Mathematics', dates: '1830s', highlights: ['Studied under De Morgan'] }],
  projects: [{ name: 'Note G', description: 'Bernoulli number program', tech_stack: ['Analytical Engine'], bullets: ['First published algorithm'] }],
  keywords_injected: ['algorithms', 'computation'],
};

const JOB = { title: 'Senior Computation Engineer', company: 'Babbage Ltd' };

// ── esc ───────────────────────────────────────────────────────────────────────
test('esc escapes the five HTML-significant characters', () => {
  assert.equal(esc('<script>'), '&lt;script&gt;');
  assert.equal(esc('Tom & Jerry'), 'Tom &amp; Jerry');
  assert.equal(esc(`"quoted" and 'single'`), '&quot;quoted&quot; and &#39;single&#39;');
});

test('esc renders null and undefined as empty strings, not "null"', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});

test('escList escapes every entry', () => {
  assert.deepEqual(escList(['a<b', 'c&d']), ['a&lt;b', 'c&amp;d']);
  assert.deepEqual(escList(null), []);
});

// ── buildContactLines ─────────────────────────────────────────────────────────
test('buildContactLines assembles place, contact and linkedin lines', () => {
  const lines = buildContactLines(PROFILE);
  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'London, United Kingdom');
  assert.ok(lines[1].includes('ada@example.com'));
  assert.ok(lines[1].includes('+44 7000 000000'));
  assert.equal(lines[2], 'linkedin.com/in/ada');
});

test('buildContactLines omits missing fields rather than leaving gaps', () => {
  assert.deepEqual(buildContactLines({ email: 'a@b.com' }), ['a@b.com']);
  assert.deepEqual(buildContactLines({ city: 'Lagos' }), ['Lagos']);
  assert.deepEqual(buildContactLines({}), []);
  assert.deepEqual(buildContactLines(null), []);
});

// ── buildCVHTML ───────────────────────────────────────────────────────────────
test('buildCVHTML never emits bracketed placeholder text', () => {
  // Regression guard: the header used to ship "[Email Placeholder]" and friends
  // into every generated CV.
  const html = buildCVHTML(CV, PROFILE, JOB);
  assert.doesNotMatch(html, /\[[A-Za-z /]*Placeholder\]/);
});

test('buildCVHTML puts real contact details in the header', () => {
  const html = buildCVHTML(CV, PROFILE, JOB);
  assert.ok(html.includes('Ada Lovelace'));
  assert.ok(html.includes('ada@example.com'));
  assert.ok(html.includes('+44 7000 000000'));
  assert.ok(html.includes('London, United Kingdom'));
});

test('buildCVHTML uses the target job title as the profession line', () => {
  const html = buildCVHTML(CV, PROFILE, JOB);
  assert.ok(html.includes('<div class="title">Senior Computation Engineer</div>'));
});

test('buildCVHTML degrades cleanly when the profile is missing', () => {
  const html = buildCVHTML(CV, {}, {});
  assert.doesNotMatch(html, /\[[A-Za-z /]*Placeholder\]/);
  assert.ok(!html.includes('class="contact"'), 'contact block should be omitted entirely');
  assert.ok(!html.includes('class="title"'), 'title block should be omitted entirely');
  assert.ok(html.includes('Ada Lovelace'));
});

test('buildCVHTML falls back to the profile name when the model omits one', () => {
  const html = buildCVHTML({ ...CV, candidate_name: null }, PROFILE, JOB);
  assert.ok(html.includes('Ada Lovelace'));
});

test('buildCVHTML escapes model output instead of injecting raw HTML', () => {
  const hostile = {
    ...CV,
    professional_summary: '<script>alert(1)</script>',
    work_experience: [{ company: 'A & B', title: '<b>Dev</b>', dates: '2020', bullets: ['Shipped <thing>'] }],
  };
  const html = buildCVHTML(hostile, PROFILE, JOB);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('A &amp; B'));
  assert.ok(html.includes('Shipped &lt;thing&gt;'));
});

test('buildCVHTML renders every populated section', () => {
  const html = buildCVHTML(CV, PROFILE, JOB);
  for (const heading of ['Summary', 'Experience', 'Projects', 'Education', 'Skills']) {
    assert.ok(html.includes(`<h2>${heading}</h2>`), `missing ${heading} section`);
  }
});

test('buildCVHTML omits sections with no data', () => {
  const html = buildCVHTML({ candidate_name: 'Ada' }, PROFILE, JOB);
  assert.ok(!html.includes('<h2>Experience</h2>'));
  assert.ok(!html.includes('<h2>Projects</h2>'));
  assert.ok(!html.includes('<h2>Skills</h2>'));
});

// ── buildCoverLetterHTML ──────────────────────────────────────────────────────
test('buildCoverLetterHTML includes contact details and the company', () => {
  const html = buildCoverLetterHTML(
    { subject: 'Application for Senior Computation Engineer', body: 'Para one.\n\nPara two.' },
    'Ada Lovelace',
    JOB,
    PROFILE,
  );
  assert.ok(html.includes('Ada Lovelace'));
  assert.ok(html.includes('ada@example.com'));
  assert.ok(html.includes('Babbage Ltd'));
  assert.equal(html.match(/<p>Para one\.<\/p>/g).length, 1);
  assert.ok(html.includes('<p>Para two.</p>'));
});

test('buildCoverLetterHTML drops empty paragraphs from the body', () => {
  const html = buildCoverLetterHTML({ body: 'One.\n\n\n\nTwo.' }, 'Ada', JOB, PROFILE);
  assert.equal((html.match(/<div class="body">(.*?)<\/div>/s)[1].match(/<p>/g) || []).length, 2);
});

test('buildCoverLetterHTML falls back when no subject is supplied', () => {
  const html = buildCoverLetterHTML({ body: 'Hi.' }, 'Ada', { company: 'Babbage Ltd' }, PROFILE);
  assert.ok(html.includes('Application for the advertised role'));
});

test('buildCoverLetterHTML escapes the candidate name', () => {
  const html = buildCoverLetterHTML({ body: 'Hi.' }, '<b>Ada</b>', JOB, PROFILE);
  assert.ok(!html.includes('<b>Ada</b>'));
  assert.ok(html.includes('&lt;b&gt;Ada&lt;/b&gt;'));
});
