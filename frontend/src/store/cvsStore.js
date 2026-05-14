import { create } from 'zustand'
import * as cvsApi from '../api/cvs.js'

const useCVsStore = create((set) => ({
  cvs: [],
  isLoading: false,

  // ── fetchCVs ──────────────────────────────────────────────────────────────────
  fetchCVs: async () => {
    set({ isLoading: true })
    const { data, error } = await cvsApi.listCVs()
    if (!error && Array.isArray(data)) {
      set({ cvs: data, isLoading: false })
    } else {
      set({ isLoading: false })
    }
    return { error }
  },

  // ── addCV ─────────────────────────────────────────────────────────────────────
  addCV: (cv) => {
    set((state) => ({ cvs: [cv, ...state.cvs] }))
  },

  // ── updateCV ──────────────────────────────────────────────────────────────────
  updateCV: async (id, data) => {
    const { data: updated, error } = await cvsApi.updateCV(id, data)
    if (!error && updated) {
      set((state) => ({
        cvs: state.cvs.map((cv) => (cv.id === id ? { ...cv, ...updated } : cv)),
      }))
    }
    return { error }
  },

  // ── deleteCV ──────────────────────────────────────────────────────────────────
  deleteCV: async (id) => {
    const { error } = await cvsApi.deleteCV(id)
    if (!error) {
      set((state) => ({ cvs: state.cvs.filter((cv) => cv.id !== id) }))
    }
    return { error }
  },
}))

export default useCVsStore
