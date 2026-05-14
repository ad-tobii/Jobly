import express from 'express';
import supabase from '../config/supabase.js';
import auth from '../middleware/auth.js';
import { docgenQueue } from '../queues/index.js';

const router = express.Router();

// 1. GET /documents/:jobId
router.get('/:jobId', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('job_id', req.params.jobId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'No documents found for this job' });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /documents/:jobId/generate
router.post('/:jobId/generate', auth, async (req, res) => {
  try {
    const { jobId } = req.params;

    // Fetch the job record to confirm ownership
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('selected_cv_id')
      .eq('id', jobId)
      .eq('user_id', req.user.id)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.selected_cv_id) {
      return res.status(400).json({ error: 'No CV selected for this job. Call POST /jobs/:id/select-cv first.' });
    }

    // Update job status to 'generating'
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'generating' })
      .eq('id', jobId);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Queue docgen
    await docgenQueue.add('generate-docs', {
      job_id: jobId,
      cv_id: job.selected_cv_id,
      user_id: req.user.id,
    });

    res.status(202).json({ message: 'Document generation started.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;