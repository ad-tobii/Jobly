import { Worker } from 'bullmq';
import axios from 'axios';
import redis from '../config/redis.js';
import  supabase  from '../config/supabase.js';
import { scoreQueue } from '../queues/index.js';
import { formatJobForRendering } from '../utils/jobFormatter.js';
import { workerLogger } from '../config/logger.js';
import { onCompleted, onFailed, onWorkerError } from '../utils/workerFailure.js';

const scrapeWorker = new Worker(
  'scrape-queue',
  async (job) => {
    const { job_id, user_id, url } = job.data;

    console.log(`[scrapeWorker] Scraping job ${job_id}`);

    // ── Step 1: Hit the FastAPI scraper ──────────────────────────────────────
    let scraped;
    try {
      const response = await axios.post(
        `${process.env.SCRAPER_URL}/scrape`,
        { url },
        { timeout: 30000 }
      );

      if (!response.data.success) {
        throw new Error(`Scraper error: ${response.data.error?.message || 'Unknown error'}`);
      }

      scraped = response.data.data;
    } catch (err) {
      // No status write here — the 'failed' handler marks the job failed only
      // after BullMQ exhausts its retries, so a transient scraper blip doesn't
      // show the user a permanent failure it's about to recover from.
      throw new Error(`[scrapeWorker] Scrape failed: ${err.message}`);
    }

    console.log(`[scrapeWorker] Scraped — ${scraped.title} at ${scraped.company}`);

    const renderSections = await formatJobForRendering({
      title: scraped.title,
      company: scraped.company,
      location: scraped.location,
      description: scraped.description,
    });

    // ── Step 2: Update job record with scraped data ───────────────────────────
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        title: scraped.title,
        company: scraped.company,
        location: scraped.location,
        logo_url: scraped.logo_url,
        description: scraped.description,
        raw_description: scraped.description,
        render_description: renderSections,
        raw_details: scraped.details,
        status: 'scraped',
      })
      .eq('id', job_id);

    if (updateError) throw new Error(`[scrapeWorker] Job update failed: ${updateError.message}`);

    // ── Step 3: Queue score worker ────────────────────────────────────────────
    await scoreQueue.add('score-job', {
      job_id,
      user_id,
    });

    console.log(`[scrapeWorker] Job ${job_id} scraped and queued for scoring ✓`);
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

const log = workerLogger('scrape');

scrapeWorker.on('completed', onCompleted(log));
scrapeWorker.on('failed', onFailed({ log, table: 'jobs', idFrom: (data) => data.job_id }));
scrapeWorker.on('error', onWorkerError(log));

export default scrapeWorker;
