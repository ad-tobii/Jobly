import client from './client.js'

const wrap = async (fn) => {
  try {
    const res = await fn()
    return { data: res.data, error: null }
  } catch (err) {
    return { data: null, error: err.response?.data?.error || err.message }
  }
}

// POST /applications/:jobId
export const markApplied = (jobId) =>
  wrap(() => client.post(`/applications/${jobId}`))

// PATCH /applications/:id
export const updateStatus = (id, status, notes) =>
  wrap(() => client.patch(`/applications/${id}`, { status, notes }))

// GET /applications  — optional params: { status }
export const listApplications = (params = {}) =>
  wrap(() => client.get('/applications', { params }))
