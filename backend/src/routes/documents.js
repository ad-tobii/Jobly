import express from 'express';
import supabase from '../config/supabase.js';
import auth from '../middleware/auth.js';
import { docgenQueue } from '../queues/index.js';
import { asyncHandler, badRequest, notFound, ApiError } from '../middleware/respond.js';
import validate from '../middleware/validate.js';
import { jobIdParam } from '../schemas/index.js';
import { generationLimiter } from '../middleware/rateLimit.js';
import { withSignedDocumentUrls } from '../utils/storage.js';

const router = express.Router();

// ── GET /documents/:jobId ────────────────────────────────────────────────────
router.get(
  '/:jobId',
  auth,
  validate({ params: jobIdParam }),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('job_id', req.params.jobId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw new ApiError(500, error.message);
    if (!data) throw notFound('No documents found for this job');

    res.ok(await withSignedDocumentUrls(data));
  }),
);

// ── POST /documents/:jobId/generate ──────────────────────────────────────────
router.post(
  '/:jobId/generate',
  auth,
  generationLimiter,
  validate({ params: jobIdParam }),
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('selected_cv_id, status')
      .eq('id', jobId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (jobError) throw new ApiError(500, jobError.message);
    if (!job) throw notFound('Job not found');

    if (!job.selected_cv_id) {
      throw badRequest('Pick a CV for this job before generating documents.');
    }

    // Don't queue a second render on top of one already running.
    if (job.status === 'generating') {
      return res.ok({ message: 'Document generation is already in progress.' }, 202);
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'generating' })
      .eq('id', jobId)
      .eq('user_id', req.user.id);

    if (updateError) throw new ApiError(500, updateError.message);

    await docgenQueue.add('generate-docs', {
      job_id: jobId,
      cv_id: job.selected_cv_id,
      user_id: req.user.id,
      correlation_id: req.id,
    });

    req.log?.info({ jobId }, 'queued document generation');
    res.ok({ message: 'Document generation started.' }, 202);
  }),
);

export default router;
