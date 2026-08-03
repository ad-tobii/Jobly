import { Queue } from 'bullmq';
import redis from '../config/redis.js';

// Without these, a transient provider error kills a job permanently and every
// completed job record stays in Redis forever.
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  // Keep a short tail for debugging; drop the rest so Redis stays bounded.
  removeOnComplete: { age: 24 * 3600, count: 200 },
  removeOnFail: { age: 7 * 24 * 3600, count: 500 },
};

// Document generation is the expensive one — a full Puppeteer render plus two
// LLM calls. Retry it, but fewer times and with a longer gap.
const docgenJobOptions = {
  ...defaultJobOptions,
  attempts: 2,
  backoff: { type: 'exponential', delay: 30000 },
};

// A missed digest is not worth retrying hard; the next scheduler tick catches it.
const digestJobOptions = {
  ...defaultJobOptions,
  attempts: 2,
  removeOnComplete: { age: 3 * 24 * 3600, count: 100 },
};

export const cvQueue = new Queue('cv-queue', { connection: redis, defaultJobOptions });
export const scrapeQueue = new Queue('scrape-queue', { connection: redis, defaultJobOptions });
export const scoreQueue = new Queue('score-queue', { connection: redis, defaultJobOptions });
export const docgenQueue = new Queue('docgen-queue', {
  connection: redis,
  defaultJobOptions: docgenJobOptions,
});
export const digestQueue = new Queue('digest-queue', {
  connection: redis,
  defaultJobOptions: digestJobOptions,
});

export const ALL_QUEUES = [cvQueue, scrapeQueue, scoreQueue, docgenQueue, digestQueue];
