import client from './client.js'

const wrap = async (fn) => {
  try {
    const res = await fn()
    return { data: res.data, error: null }
  } catch (err) {
    return { data: null, error: err.response?.data?.error || err.message }
  }
}

// GET /documents/:jobId
export const getDocuments = (jobId) =>
  wrap(() => client.get(`/documents/${jobId}`))
