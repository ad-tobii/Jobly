// The Supabase client throws at construction without SUPABASE_URL, so it's
// imported on first use — that keeps isFinalAttempt testable on its own.
let supabasePromise = null;
const getSupabase = async () => {
  supabasePromise ??= import('../config/supabase.js').then((module) => module.default);
  return supabasePromise;
};

/**
 * Has this job used up all its retries?
 *
 * BullMQ increments attemptsMade before emitting 'failed', so once it reaches
 * the configured attempts limit there will be no further retry. Intermediate
 * failures must not be surfaced to the user as a terminal state — the job is
 * about to run again.
 */
export function isFinalAttempt(job) {
  const maxAttempts = job?.opts?.attempts ?? 1;
  return (job?.attemptsMade ?? 0) >= maxAttempts;
}

/**
 * Standard 'failed' handler: log every attempt, but only write a terminal
 * status to the database once the retries are exhausted.
 *
 * @param {object} options
 * @param {import('pino').Logger} options.log
 * @param {string} options.table          - table holding the record to mark
 * @param {(jobData: object) => string|undefined} options.idFrom - record id from job data
 * @param {object} [options.terminalUpdate] - columns to write on final failure
 */
export function onFailed({ log, table, idFrom, terminalUpdate = { status: 'failed' } }) {
  return async (job, err) => {
    const attempt = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 1;
    const final = isFinalAttempt(job);

    log.error(
      {
        jobId: job?.id,
        correlationId: job?.data?.correlation_id,
        attempt,
        maxAttempts,
        final,
        err: err?.message,
      },
      final ? 'job failed permanently' : 'job attempt failed, will retry',
    );

    if (!final) return;

    const recordId = idFrom(job?.data || {});
    if (!recordId) return;

    const supabase = await getSupabase();
    const { error } = await supabase.from(table).update(terminalUpdate).eq('id', recordId);
    if (error) {
      log.error({ table, recordId, err: error.message }, 'could not write terminal status');
    }
  };
}

/** Standard 'completed' handler. */
export function onCompleted(log) {
  return (job) => {
    log.info(
      { jobId: job?.id, correlationId: job?.data?.correlation_id },
      'job completed',
    );
  };
}

/** Standard worker-level 'error' handler (connection issues, not job failures). */
export function onWorkerError(log) {
  return (err) => log.error({ err: err?.message }, 'worker error');
}
