import logger from '../config/logger.js';

/**
 * A failure the client should see verbatim. Anything else that reaches the
 * error handler is treated as a bug and reported as a generic 500.
 */
export class ApiError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options.code || defaultCode(status);
    this.details = options.details;
  }
}

function defaultCode(status) {
  return (
    {
      400: 'bad_request',
      401: 'unauthorized',
      403: 'forbidden',
      404: 'not_found',
      409: 'conflict',
      413: 'payload_too_large',
      429: 'rate_limited',
    }[status] || 'internal_error'
  );
}

/** Shorthand constructors for the statuses the routes actually use. */
export const badRequest = (message, details) => new ApiError(400, message, { details });
export const unauthorized = (message = 'Not authenticated') => new ApiError(401, message);
export const notFound = (message = 'Not found') => new ApiError(404, message);
export const conflict = (message) => new ApiError(409, message);

/**
 * Adds res.ok / res.fail so every route returns the same envelope:
 *   success -> { success: true,  data: <payload> }
 *   failure -> { success: false, error: { message, code, details? } }
 *
 * Before this, auth.js used one shape and every other route used another, so
 * the frontend had to special-case which one it was talking to.
 */
export function respond(req, res, next) {
  res.ok = (data = null, status = 200) => res.status(status).json({ success: true, data });

  res.fail = (status, message, options = {}) =>
    res.status(status).json({
      success: false,
      error: {
        message,
        code: options.code || defaultCode(status),
        ...(options.details ? { details: options.details } : {}),
      },
    });

  next();
}

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

/** Terminal 404 for unmatched routes. */
export function notFoundHandler(req, res) {
  res.fail(404, `No route for ${req.method} ${req.path}`);
}

/**
 * Central error handler. Known ApiErrors pass their message through; anything
 * else is logged with a stack and reported as a generic 500, so internal
 * details (SQL, provider errors) never reach the client.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export function errorHandler(err, req, res, next) {
  const log = req.log || logger;

  // Defensive: if something failed before the respond middleware ran, res.fail
  // won't exist and reaching for it would mask the real error with a crash.
  if (typeof res.fail !== 'function') {
    respond(req, res, () => {});
  }

  // A malformed JSON body is the client's fault, not a server bug.
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.fail(400, 'Request body is not valid JSON.');
  }

  if (err?.type === 'entity.too.large') {
    return res.fail(413, 'Request body is too large.');
  }

  if (err instanceof ApiError) {
    log.warn({ status: err.status, code: err.code, err: err.message }, 'request failed');
    return res.fail(err.status, err.message, { code: err.code, details: err.details });
  }

  // Multer signals an oversized upload with this code.
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.fail(413, 'File is too large.');
  }

  log.error({ err: err?.message, stack: err?.stack }, 'unhandled error');
  return res.fail(500, 'Something went wrong on our end.');
}
