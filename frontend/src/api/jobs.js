import client, { wrap } from './client.js'

// POST /jobs/url
export const submitUrl = (url) =>
  wrap(() => client.post('/jobs/url', { url }))

// POST /jobs/paste
export const submitPaste = (raw_text) =>
  wrap(() => client.post('/jobs/paste', { raw_text }))

// POST /jobs/:id/select-cv
export const selectCV = (jobId, cv_id) =>
  wrap(() => client.post(`/jobs/${jobId}/select-cv`, { cv_id }))

// GET /jobs  — optional params: { status, min_score }
export const listJobs = (params = {}) =>
  wrap(() => client.get('/jobs', { params }))

// GET /jobs/dashboard — params: { timeline }
export const getDashboard = (params = {}) =>
  wrap(() => client.get('/jobs/dashboard', { params }))

// GET /jobs/:id
export const getJob = (id) =>
  wrap(() => client.get(`/jobs/${id}`))

// DELETE /jobs/:id
export const deleteJob = (id) =>
  wrap(() => client.delete(`/jobs/${id}`))

// POST /documents/:jobId/generate  — trigger doc generation manually
export const triggerDocs = (jobId) =>
  wrap(() => client.post(`/documents/${jobId}/generate`))
