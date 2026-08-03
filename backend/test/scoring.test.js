import test from 'node:test';
import assert from 'node:assert/strict';

import { RECOMMEND_THRESHOLD, isRecommended, jobStatusForScore } from '../src/utils/scoring.js';
import { isFinalAttempt } from '../src/utils/workerFailure.js';

// ── scoring ───────────────────────────────────────────────────────────────────
test('a job labelled recommended always has a recommended match', () => {
  // Regression guard: the match flag used to trigger at 80 while the job status
  // flipped at 70, so a job could read "Recommended" with no recommended match.
  for (const score of [69, 70, 71, 79, 80, 81, 100]) {
    const status = jobStatusForScore(score);
    if (status === 'recommended') {
      assert.equal(isRecommended(score), true, `score ${score} disagrees`);
    }
  }
});

test('isRecommended uses one shared threshold', () => {
  assert.equal(isRecommended(RECOMMEND_THRESHOLD), true);
  assert.equal(isRecommended(RECOMMEND_THRESHOLD - 1), false);
});

test('isRecommended rejects non-numeric scores', () => {
  assert.equal(isRecommended(null), false);
  assert.equal(isRecommended(undefined), false);
  assert.equal(isRecommended('90'), false);
});

test('jobStatusForScore maps to the two pipeline statuses', () => {
  assert.equal(jobStatusForScore(95), 'recommended');
  assert.equal(jobStatusForScore(10), 'low_match');
  assert.equal(jobStatusForScore(null), 'low_match');
});

// ── retry semantics ───────────────────────────────────────────────────────────
test('isFinalAttempt is false while retries remain', () => {
  assert.equal(isFinalAttempt({ attemptsMade: 1, opts: { attempts: 3 } }), false);
  assert.equal(isFinalAttempt({ attemptsMade: 2, opts: { attempts: 3 } }), false);
});

test('isFinalAttempt is true once retries are exhausted', () => {
  assert.equal(isFinalAttempt({ attemptsMade: 3, opts: { attempts: 3 } }), true);
  assert.equal(isFinalAttempt({ attemptsMade: 4, opts: { attempts: 3 } }), true);
});

test('isFinalAttempt treats an unconfigured job as single-shot', () => {
  assert.equal(isFinalAttempt({ attemptsMade: 1, opts: {} }), true);
  assert.equal(isFinalAttempt({}), false);
  assert.equal(isFinalAttempt(null), false);
});
