import client, { wrap } from './client.js'

// GET /documents/:jobId
export const getDocuments = (jobId) =>
  wrap(() => client.get(`/documents/${jobId}`))
