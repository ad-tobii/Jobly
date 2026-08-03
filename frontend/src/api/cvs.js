import client, { wrap } from './client.js'

// POST /cv/upload  — multipart/form-data
export const uploadPDF = (file, label) => {
  const form = new FormData()
  form.append('cv', file)
  form.append('label', label)
  return wrap(() =>
    client.post('/cv/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  )
}

// POST /cv/text
export const submitText = (label, raw_text) =>
  wrap(() => client.post('/cv/text', { label, raw_text }))

// GET /cv
export const listCVs = () =>
  wrap(() => client.get('/cv'))

// PATCH /cv/:id
export const updateCV = (id, data) =>
  wrap(() => client.patch(`/cv/${id}`, data))

// DELETE /cv/:id
export const deleteCV = (id) =>
  wrap(() => client.delete(`/cv/${id}`))

// POST /cv/:id/enhance/questions
export const getQuestions = (id) =>
  wrap(() => client.post(`/cv/${id}/enhance/questions`))

// POST /cv/:id/enhance/apply
export const applyEnhancement = (id, questions, answers) =>
  wrap(() => client.post(`/cv/${id}/enhance/apply`, { questions, answers }))

// POST /cv/:id/skip-enhancement
export const skipEnhancement = (id) =>
  wrap(() => client.post(`/cv/${id}/skip-enhancement`))
