import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applicationPatchSchema,
  cvTextSchema,
  jobListQuerySchema,
  jobUrlSchema,
  loginSchema,
  onboardingSchema,
  signupSchema,
} from '../src/schemas/index.js';

const fails = (schema, value) => {
  const result = schema.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
};

// ── jobUrlSchema ──────────────────────────────────────────────────────────────
test('accepts LinkedIn job URLs', () => {
  assert.equal(jobUrlSchema.safeParse({ url: 'https://www.linkedin.com/jobs/view/123' }).success, true);
  assert.equal(jobUrlSchema.safeParse({ url: 'https://linkedin.com/jobs/view/123' }).success, true);
});

test('rejects non-LinkedIn hosts', () => {
  assert.match(fails(jobUrlSchema, { url: 'https://indeed.com/job/1' }), /Only LinkedIn/);
});

test('rejects a host that merely contains "linkedin"', () => {
  // Guards against a substring check like url.includes('linkedin.com').
  assert.match(fails(jobUrlSchema, { url: 'https://linkedin.com.evil.test/jobs' }), /Only LinkedIn/);
});

test('rejects non-http schemes', () => {
  assert.ok(fails(jobUrlSchema, { url: 'javascript:alert(1)' }));
  assert.ok(fails(jobUrlSchema, { url: 'not a url' }));
});

// ── signup / login ────────────────────────────────────────────────────────────
test('signup requires a usable email, password and name', () => {
  assert.match(fails(signupSchema, {}), /email/i);
  assert.match(fails(signupSchema, { email: 'a@b.com', password: 'short', full_name: 'A B' }), /8 characters/);
  assert.equal(
    signupSchema.safeParse({ email: 'a@b.com', password: 'longenough', full_name: 'Ada L' }).success,
    true,
  );
});

test('signup normalises the email', () => {
  const parsed = signupSchema.parse({
    email: '  ADA@Example.COM ',
    password: 'longenough',
    full_name: '  Ada L  ',
  });
  assert.equal(parsed.email, 'ada@example.com');
  assert.equal(parsed.full_name, 'Ada L');
});

test('unknown fields are stripped rather than passed through', () => {
  const parsed = signupSchema.parse({
    email: 'a@b.com',
    password: 'longenough',
    full_name: 'Ada L',
    is_admin: true,
  });
  assert.equal('is_admin' in parsed, false);
});

test('login accepts any non-empty password', () => {
  assert.equal(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success, true);
  assert.ok(fails(loginSchema, { email: 'a@b.com', password: '' }));
});

// ── CV text ───────────────────────────────────────────────────────────────────
test('CV text must be substantial', () => {
  assert.match(fails(cvTextSchema, { label: 'CV', raw_text: 'too short' }), /too short/);
  assert.equal(cvTextSchema.safeParse({ label: 'CV', raw_text: 'x'.repeat(100) }).success, true);
});

// ── query coercion ────────────────────────────────────────────────────────────
test('min_score is coerced from the query string', () => {
  const parsed = jobListQuerySchema.parse({ min_score: '70' });
  assert.equal(parsed.min_score, 70);
});

test('an out-of-range or unknown filter is rejected', () => {
  assert.ok(fails(jobListQuerySchema, { min_score: '150' }));
  assert.ok(fails(jobListQuerySchema, { status: 'nonsense' }));
});

// ── onboarding defaults ───────────────────────────────────────────────────────
test('onboarding fills sensible preference defaults', () => {
  const parsed = onboardingSchema.parse({});
  assert.equal(parsed.preferences.digest_frequency, 'daily');
  assert.equal(parsed.preferences.digest_time, '08:00');
  assert.equal(parsed.preferences.timezone, 'UTC');
});

test('a malformed digest time is rejected', () => {
  assert.ok(fails(onboardingSchema, { preferences: { digest_time: '25:00' } }));
  assert.ok(fails(onboardingSchema, { preferences: { digest_time: '8am' } }));
});

// ── application patch ─────────────────────────────────────────────────────────
test('application patch needs at least one field', () => {
  assert.match(fails(applicationPatchSchema, {}), /status or notes/);
});

test('application patch rejects a status the backend does not know', () => {
  assert.ok(fails(applicationPatchSchema, { status: 'ghosted' }));
  assert.equal(applicationPatchSchema.safeParse({ status: 'offer' }).success, true);
});

test('notes may be cleared with null', () => {
  assert.equal(applicationPatchSchema.safeParse({ notes: null }).success, true);
});
