import dotenv from 'dotenv';

dotenv.config();

import logger from './config/logger.js';
import { ALL_QUEUES } from './queues/index.js';

// Importing a worker module starts it.
import cvWorker from './workers/cvWorker.js';
import scrapeWorker from './workers/scrapeWorker.js';
import scoreWorker from './workers/scoreWorker.js';
import docgenWorker from './workers/docgenWorker.js';
import digestWorker from './workers/digestWorker.js';
import './workers/digestScheduler.js';

const workers = [cvWorker, scrapeWorker, scoreWorker, docgenWorker, digestWorker];

logger.info({ workers: workers.length }, 'workers started');

// Finish in-flight jobs before exiting so a deploy doesn't strand a half-rendered
// PDF or a partially embedded CV.
async function shutdown(signal) {
  logger.info({ signal }, 'shutting down workers');
  try {
    await Promise.all(workers.map((worker) => worker.close()));
    await Promise.all(ALL_QUEUES.map((queue) => queue.close()));
    logger.info('workers closed cleanly');
    process.exit(0);
  } catch (err) {
    logger.error({ err: err?.message }, 'error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason instanceof Error ? reason.message : String(reason) }, 'unhandled rejection');
});
