/**
 * Match score thresholds.
 *
 * These used to disagree: scoreWorker flagged an individual CV match as
 * recommended at >= 80 while setting the job's status to 'recommended' at
 * >= 70, and the UI warned before tailoring below 70. A job could therefore
 * read "Recommended" while none of its matches were. One number now.
 *
 * Keep in sync with frontend/src/lib/jobs.ts.
 */
export const RECOMMEND_THRESHOLD = 70;

/** Below this the UI shows the score in red rather than amber. */
export const WEAK_THRESHOLD = 50;

export function isRecommended(score) {
  return typeof score === 'number' && score >= RECOMMEND_THRESHOLD;
}

export function jobStatusForScore(score) {
  return isRecommended(score) ? 'recommended' : 'low_match';
}
