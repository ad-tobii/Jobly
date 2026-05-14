import { Queue } from 'bullmq';
import redis from '../config/redis.js';

export const cvQueue = new Queue('cv-queue', { connection: redis });
export const scrapeQueue = new Queue('scrape-queue', { connection: redis });
export const scoreQueue = new Queue('score-queue', { connection: redis });
export const docgenQueue = new Queue('docgen-queue', { connection: redis });
export const digestQueue = new Queue('digest-queue', { connection: redis });