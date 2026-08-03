import client, { wrap } from './client.js'

// POST /applications/:jobId
export const markApplied = (jobId) =>
  wrap(() => client.post(`/applications/${jobId}`))

// PATCH /applications/:id
export const updateStatus = (id, status, notes) =>
  wrap(() => client.patch(`/applications/${id}`, { status, notes }))

// GET /applications  — optional params: { status }
export const listApplications = (params = {}) =>
  wrap(() => client.get('/applications', { params }))
