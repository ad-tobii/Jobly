import supabase from '../config/supabase.js';
import logger from '../config/logger.js';

/**
 * Signed-URL helpers for the private `cvs` and `documents` buckets.
 *
 * These buckets used to be public, which meant anyone holding (or guessing) a
 * URL could read someone's CV. Records now store the storage *path*, and URLs
 * are minted on read with a short expiry.
 */

export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/** Upload a buffer and return its storage path (not a URL). */
export async function uploadToBucket(bucket, path, body, contentType, { upsert = false } = {}) {
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

/** Mint a time-limited URL for one object. Returns null if it can't be signed. */
export async function signPath(bucket, path, expiresIn = SIGNED_URL_TTL_SECONDS) {
  if (!path) return null;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    logger.warn({ bucket, path, err: error.message }, 'could not sign storage path');
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Sign several paths from one bucket in a single round trip.
 * @returns {Promise<Record<string, string|null>>} path -> signed URL
 */
export async function signPaths(bucket, paths, expiresIn = SIGNED_URL_TTL_SECONDS) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, expiresIn);
  if (error) {
    logger.warn({ bucket, count: unique.length, err: error.message }, 'could not batch-sign paths');
    return {};
  }

  return Object.fromEntries((data || []).map((entry) => [entry.path, entry.signedUrl ?? null]));
}

/**
 * Expand a documents row into the shape the frontend expects, swapping stored
 * paths for freshly signed URLs.
 */
export async function withSignedDocumentUrls(document) {
  if (!document) return document;

  const map = await signPaths('documents', [
    document.tailored_cv_path,
    document.cover_letter_path,
  ]);

  return {
    ...document,
    tailored_cv_url: map[document.tailored_cv_path] ?? null,
    cover_letter_url: map[document.cover_letter_path] ?? null,
  };
}

/** Same, for the `documents` array embedded in a job row. */
export async function withSignedJobDocuments(job) {
  if (!job?.documents?.length) return job;

  const paths = job.documents.flatMap((doc) => [doc.tailored_cv_path, doc.cover_letter_path]);
  const map = await signPaths('documents', paths);

  return {
    ...job,
    documents: job.documents.map((doc) => ({
      ...doc,
      tailored_cv_url: map[doc.tailored_cv_path] ?? null,
      cover_letter_url: map[doc.cover_letter_path] ?? null,
    })),
  };
}

/** Batch version for job lists — one signing call for the whole page. */
export async function withSignedJobDocumentsMany(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const paths = list.flatMap((job) =>
    (job.documents || []).flatMap((doc) => [doc.tailored_cv_path, doc.cover_letter_path]),
  );
  if (paths.length === 0) return list;

  const map = await signPaths('documents', paths);

  return list.map((job) =>
    job.documents?.length
      ? {
          ...job,
          documents: job.documents.map((doc) => ({
            ...doc,
            tailored_cv_url: map[doc.tailored_cv_path] ?? null,
            cover_letter_url: map[doc.cover_letter_path] ?? null,
          })),
        }
      : job,
  );
}

/** Remove every object under a prefix, e.g. when a job or CV is deleted. */
export async function removeByPrefix(bucket, prefix) {
  const { data, error } = await supabase.storage.from(bucket).list(prefix);
  if (error || !data?.length) return;

  const paths = data.map((entry) => `${prefix}/${entry.name}`);
  const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
  if (removeError) {
    logger.warn({ bucket, prefix, err: removeError.message }, 'could not clean up storage');
  }
}
