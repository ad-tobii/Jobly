import { create } from 'zustand'
import * as applicationsApi from '../api/applications.js'

const useApplicationsStore = create((set) => ({
  applications: [],
  isLoading: false,

  // ── fetchApplications ──────────────────────────────────────────────────────────
  fetchApplications: async (params = {}) => {
    set({ isLoading: true })
    const { data, error } = await applicationsApi.listApplications(params)
    if (!error && Array.isArray(data)) {
      set({ applications: data, isLoading: false })
    } else {
      set({ isLoading: false })
    }
    return { error }
  },

  // ── updateApplicationStatus ────────────────────────────────────────────────────
  updateApplicationStatus: async (id, status, notes) => {
    const { data, error } = await applicationsApi.updateStatus(id, status, notes)
    if (!error && data) {
      set((state) => ({
        applications: state.applications.map((app) =>
          app.id === id ? { ...app, ...data } : app
        ),
      }))
    }
    return { error }
  },
}))

export default useApplicationsStore
