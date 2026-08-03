import { Worker } from 'bullmq';
import axios from 'axios';
import redis from '../config/redis.js';
import supabase from '../config/supabase.js';
import { workerLogger } from '../config/logger.js';
import { onCompleted, onFailed, onWorkerError } from '../utils/workerFailure.js';
import { signPaths } from '../utils/storage.js';

// Digest emails sit in an inbox — a one-hour link would be dead on arrival.
const DIGEST_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

const digestWorker = new Worker(
  'digest-queue',
  async (job) => {
    const { user_id } = job.data;

    // 1. Fetch user record
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name, preferences, last_digest_sent')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      throw new Error(`[digestWorker] User ${user_id} not found: ${userError?.message}`);
    }

    // 2. Fetch all ready undigested jobs for this user
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*, documents(tailored_cv_path, cover_letter_path)')
      .eq('user_id', user_id)
      .eq('status', 'ready')
      .eq('digest_sent', false);

    if (jobsError) {
      throw new Error(`[digestWorker] Failed to fetch jobs for ${user_id}: ${jobsError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      console.log(`[digestWorker] No undigested ready jobs for ${user.email}. Skipping.`);
      return;
    }

    // 3. Build n8n payload. The digest email is read hours later, so sign the
    // document links for long enough to still work when it's opened.
    const docPaths = jobs.flatMap((j) => [
      j.documents?.[0]?.tailored_cv_path,
      j.documents?.[0]?.cover_letter_path,
    ]);
    const signed = await signPaths('documents', docPaths, DIGEST_URL_TTL_SECONDS);

    const payload = {
      user_email: user.email,
      user_name: user.full_name,
      digest_count: jobs.length,
      jobs: jobs.map((j) => ({
        job_id: j.id,
        title: j.title,
        company: j.company,
        location: j.location,
        match_score: j.match_score,
        tailored_cv_url: signed[j.documents?.[0]?.tailored_cv_path] || null,
        cover_letter_url: signed[j.documents?.[0]?.cover_letter_path] || null,
      })),
    };

    // 4. POST to N8N Webhook
    try {
      const webhookUrl = process.env.N8N_WEBHOOK_URL;
      if (!webhookUrl) {
        throw new Error('N8N_WEBHOOK_URL not configured');
      }

      const response = await axios.post(webhookUrl, payload);
      
      if (response.status >= 200 && response.status < 300) {
        // 5. Mark jobs as digest_sent = true
        const jobIds = jobs.map((j) => j.id);
        const { error: updateJobsError } = await supabase
          .from('jobs')
          .update({ digest_sent: true })
          .in('id', jobIds);

        if (updateJobsError) {
          throw new Error(`Failed to update digest_sent on jobs: ${updateJobsError.message}`);
        }

        // 6. Update user's last_digest_sent
        const { error: updateUserError } = await supabase
          .from('users')
          .update({ last_digest_sent: new Date().toISOString() })
          .eq('id', user_id);

        if (updateUserError) {
          throw new Error(`Failed to update last_digest_sent on user: ${updateUserError.message}`);
        }

        // 7. Log success
        console.log(`[digestWorker] Digest sent to ${user.email} — ${jobs.length} jobs included`);
      } else {
        throw new Error(`N8N returned status ${response.status}`);
      }
    } catch (err) {
      console.error(`[digestWorker] Failed to send digest for ${user.email}:`, err.message);
    }
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

const log = workerLogger('digest');

digestWorker.on('completed', onCompleted(log));
// A digest owns no database record to mark, so just log the failure.
digestWorker.on('failed', onFailed({ log, table: null, idFrom: () => undefined }));
digestWorker.on('error', onWorkerError(log));

export default digestWorker;
