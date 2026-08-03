import express from 'express';
import supabase from '../config/supabase.js';
import auth from '../middleware/auth.js';
import { asyncHandler, conflict, notFound, ApiError } from '../middleware/respond.js';
import validate from '../middleware/validate.js';
import {
  applicationListQuerySchema,
  applicationPatchSchema,
  idParam,
  jobIdParam,
} from '../schemas/index.js';

const router = express.Router();

// ── POST /applications/:jobId — mark a job as applied ────────────────────────
router.post(
  '/:jobId',
  auth,
  validate({ params: jobIdParam }),
  asyncHandler(async (req, res) => {
    // One RPC so the application insert and the job status update either both
    // land or neither does. As two separate calls, a failure on the second left
    // an application attached to a job that still read 'ready'.
    const { data, error } = await supabase.rpc('create_application', {
      p_job_id: req.params.jobId,
      p_user_id: req.user.id,
    });

    if (error) {
      if (error.message?.includes('JOB_NOT_FOUND')) throw notFound('Job not found');
      if (error.message?.includes('ALREADY_APPLIED')) {
        throw conflict('You have already marked this job as applied.');
      }
      throw new ApiError(500, error.message);
    }

    res.ok(data, 201);
  }),
);

// ── PATCH /applications/:id — update status and/or notes ─────────────────────
router.patch(
  '/:id',
  auth,
  validate({ params: idParam, body: applicationPatchSchema }),
  asyncHandler(async (req, res) => {
    const { status, notes } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await supabase
      .from('applications')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .maybeSingle();

    if (error) throw new ApiError(500, error.message);
    if (!data) throw notFound('Application not found');

    res.ok(data);
  }),
);

// ── GET /applications ────────────────────────────────────────────────────────
router.get(
  '/',
  auth,
  validate({ query: applicationListQuerySchema }),
  asyncHandler(async (req, res) => {
    let query = supabase
      .from('applications')
      .select('*, jobs!inner(title, company, location, logo_url, match_score)')
      .eq('user_id', req.user.id)
      .order('applied_at', { ascending: false });

    if (req.query.status) query = query.eq('status', req.query.status);

    const { data, error } = await query;
    if (error) throw new ApiError(500, error.message);

    res.ok(data);
  }),
);

export default router;
