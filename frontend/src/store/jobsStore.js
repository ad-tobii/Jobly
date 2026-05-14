import { create } from 'zustand'
import * as jobsApi from '../api/jobs.js'

const useJobsStore = create((set, get) => ({
  jobs: [],
  activeJob: null,
  isLoading: false,

  // ── fetchJobs ─────────────────────────────────────────────────────────────────
  fetchJobs: async (params = {}) => {
    set({ isLoading: true })
    const { data, error } = await jobsApi.listJobs(params)
    if (!error && Array.isArray(data)) {
      set({ jobs: data, isLoading: false })
    } else {
      set({ isLoading: false })
    }
    return { error }
  },

  // ── fetchJob ──────────────────────────────────────────────────────────────────
  fetchJob: async (id) => {
    set({ isLoading: true })
    const { data, error } = await jobsApi.getJob(id)
    if (!error && data) {
      set({ activeJob: data, isLoading: false })
      // Also update in list if present
      set((state) => ({
        jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...data } : j)),
      }))
    } else {
      set({ isLoading: false })
    }
    return { data, error }
  },

  // ── addJob ────────────────────────────────────────────────────────────────────
  addJob: (job) => {
    set((state) => ({ jobs: [job, ...state.jobs] }))
  },

  // ── updateJob ─────────────────────────────────────────────────────────────────
  updateJob: (id, updates) => {
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
      activeJob:
        state.activeJob?.id === id
          ? { ...state.activeJob, ...updates }
          : state.activeJob,
    }))
  },

  // ── deleteJob ─────────────────────────────────────────────────────────────────
  deleteJob: async (id) => {
    const { error } = await jobsApi.deleteJob(id)
    if (!error) {
      set((state) => ({
        jobs: state.jobs.filter((j) => j.id !== id),
        activeJob: state.activeJob?.id === id ? null : state.activeJob,
      }))
    }
    return { error }
  },
}))

export default useJobsStore
