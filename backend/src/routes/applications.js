import express from 'express';
import supabase from '../config/supabase.js';
import auth from '../middleware/auth.js';

const router = express.Router();

const VALID_STATUSES = ['applied', 'interviewing', 'offer', 'rejected', 'dismissed'];

// 1. POST /applications/:jobId
router.post('/:jobId', auth, async (req, res) => {
  try {
    const { jobId } = req.params;

    // Check if application already exists
    const { data: existingApp, error: existingError } = await supabase
      .from('applications')
      .select('id')
      .eq('job_id', jobId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (existingError) {
      return res.status(500).json({ error: existingError.message });
    }

    if (existingApp) {
      return res.status(409).json({ error: 'Application already exists for this job' });
    }

    // Insert new application
    const { data: app, error: insertError } = await supabase
      .from('applications')
      .insert({
        job_id: jobId,
        user_id: req.user.id,
        status: 'applied',
      })
      .select()
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    // Update jobs table status
    const { error: jobUpdateError } = await supabase
      .from('jobs')
      .update({ status: 'applied' })
      .eq('id', jobId);

    if (jobUpdateError) {
      return res.status(500).json({ error: jobUpdateError.message });
    }

    res.status(201).json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. PATCH /applications/:id
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const updates = { updated_at: new Date().toISOString() };

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updates.status = status;
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    const { data: updatedApp, error } = await supabase
      .from('applications')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error || !updatedApp) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(updatedApp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET /applications
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('applications')
      .select(`
        *,
        jobs!inner(title, company, location, logo_url, match_score)
      `)
      .eq('user_id', req.user.id)
      .order('applied_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Format the response to embed job details if needed
    // Assuming Supabase returns a nested 'jobs' object
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;