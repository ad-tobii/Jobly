import { ZodError } from 'zod';
import { badRequest } from './respond.js';

/**
 * Validates and replaces req.body / req.params / req.query from zod schemas.
 *
 * Parsed output is written back, so handlers get coerced, trimmed, defaulted
 * values and unknown keys are stripped — a route can't be driven by a field
 * nobody declared.
 *
 *   router.post('/', auth, validate({ body: createJobSchema }), handler)
 */
export function validate(schemas) {
  return (req, res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // req.query is a getter on Express 5 — assign onto a plain holder.
        Object.defineProperty(req, 'query', {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
        });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        }));
        // Lead with the first problem so a plain toast is still useful.
        return next(badRequest(details[0]?.message || 'Invalid request.', details));
      }
      next(err);
    }
  };
}

export default validate;
