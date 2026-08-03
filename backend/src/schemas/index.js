import { z } from 'zod';

// ── Primitives ────────────────────────────────────────────────────────────────
const uuid = z.string({ error: 'Must be a valid id.' }).uuid('Must be a valid id.');
const trimmed = (max) => z.string().trim().max(max);

export const idParam = z.object({ id: uuid });
export const jobIdParam = z.object({ jobId: uuid });

// ── Auth ──────────────────────────────────────────────────────────────────────
export const signupSchema = z.object({
  email: z.string({ error: 'Enter your email address.' }).trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string({ error: 'Choose a password.' }).min(8, 'Password must be at least 8 characters.').max(72),
  full_name: z.string({ error: 'Enter your full name.' }).trim().min(2, 'Enter your full name.').max(120),
});

export const loginSchema = z.object({
  email: z.string({ error: 'Enter your email address.' }).trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.'),
});

export const profileSchema = z
  .object({
    full_name: trimmed(120).min(2).optional(),
    phone: trimmed(40).optional(),
    linkedin_url: trimmed(300).optional(),
    city: trimmed(120).optional(),
    country: trimmed(120).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const preferencesSchema = z.object({
  digest_frequency: z.enum(['daily', 'twice_daily', 'weekly']).default('daily'),
  digest_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Digest time must be HH:MM.')
    .default('08:00'),
  timezone: trimmed(64).default('UTC'),
});

// `.default({})` would store the literal empty object and skip the per-field
// defaults inside preferencesSchema, so parse the nested object explicitly.
export const onboardingSchema = z
  .object({ preferences: preferencesSchema.optional() })
  .transform((value) => ({ preferences: preferencesSchema.parse(value.preferences ?? {}) }));

// ── CVs ───────────────────────────────────────────────────────────────────────
export const cvLabelSchema = z.object({
  label: z.string({ error: 'Give this CV a name.' }).trim().min(1, 'Give this CV a name.').max(120),
});

export const cvTextSchema = z.object({
  label: z.string({ error: 'Give this CV a name.' }).trim().min(1, 'Give this CV a name.').max(120),
  raw_text: z.string({ error: 'Paste your CV text.' }).trim().min(100, 'CV text is too short — paste the full CV.').max(200_000),
});

export const cvPatchSchema = z
  .object({
    label: trimmed(120).min(1).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide a label or is_active to update.',
  });

export const enhanceApplySchema = z.object({
  questions: z
    .array(z.object({ id: z.string(), question: z.string(), context: z.string().optional() }))
    .min(1, 'No questions to apply.')
    .max(20),
  answers: z.array(z.object({ id: z.string(), answer: z.string().max(4000) })).max(20),
});

// ── Jobs ──────────────────────────────────────────────────────────────────────
export const jobUrlSchema = z.object({
  url: z
    .string({ error: 'Enter a job URL.' })
    .trim()
    .url('Enter a valid URL.')
    .refine((value) => /^https?:\/\//i.test(value), 'URL must start with http or https.')
    .refine(
      (value) => /(^|\.)linkedin\.com$/i.test(safeHostname(value)),
      'Only LinkedIn job URLs are supported. Use "Paste job" for anything else.',
    ),
});

function safeHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

export const jobPasteSchema = z.object({
  raw_text: z
    .string({ error: 'Paste the job description.' })
    .trim()
    .min(100, 'Job description is too short — paste the full posting.')
    .max(200_000),
});

export const selectCvSchema = z.object({ cv_id: uuid });

export const jobListQuerySchema = z.object({
  status: z
    .enum(['scraping', 'scraped', 'scoring', 'generating', 'recommended', 'low_match', 'ready', 'applied', 'failed'])
    .optional(),
  min_score: z.coerce.number().int().min(0).max(100).optional(),
});

export const dashboardQuerySchema = z.object({
  timeline: z.enum(['today', 'weekly', 'monthly', 'all_time']).default('weekly'),
});

// ── Applications ──────────────────────────────────────────────────────────────
export const APPLICATION_STATUSES = ['applied', 'interviewing', 'offer', 'rejected', 'dismissed'];

export const applicationPatchSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES).optional(),
    notes: z.string().max(10_000).nullable().optional(),
  })
  .refine((value) => value.status !== undefined || value.notes !== undefined, {
    message: 'Provide a status or notes to update.',
  });

export const applicationListQuerySchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
});

// ── Webhooks ──────────────────────────────────────────────────────────────────
export const notifyWebhookSchema = z.object({ user_id: uuid });
