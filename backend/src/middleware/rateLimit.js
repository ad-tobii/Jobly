import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Limit per authenticated user where we know who they are, otherwise per IP.
// ipKeyGenerator normalises IPv6 to its /64 prefix — keying on the raw address
// would let a client rotate through its allocation and bypass every limit.
const keyGenerator = (req) => req.user?.id || ipKeyGenerator(req.ip);

const handler = (req, res) =>
  res.fail(429, 'Too many requests. Please slow down and try again shortly.');

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler,
};

/** Broad backstop for the whole API. */
export const globalLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 120,
});

/** Credential endpoints — blunt the obvious brute-force. */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
});

/**
 * Anything that queues an LLM or scraping job. These cost real money per call,
 * so this is a spend cap as much as an abuse control.
 */
export const ingestLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 60,
  message: 'Hourly submission limit reached.',
});

/** The most expensive path: two LLM calls plus a headless-Chrome render. */
export const generationLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 20,
});
