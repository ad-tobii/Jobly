import { create } from 'zustand'
import * as authApi from '../api/auth.js'

const TOKEN_KEY = 'jobly_token'

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem(TOKEN_KEY) || null,
  isAuthed: !!localStorage.getItem(TOKEN_KEY),
  isLoading: false,

  // ── login ────────────────────────────────────────────────────────────────────
  login: async (email, password) => {
    set({ isLoading: true })
    const { data, error } = await authApi.login(email, password)
    if (error || !data?.session) {
      set({ isLoading: false })
      return { error: error || 'Login failed' }
    }
    const { user, session } = data
    const token = session.access_token
    localStorage.setItem(TOKEN_KEY, token)
    set({ user, token, isAuthed: true, isLoading: false })
    return { error: null }
  },

  // ── signup ───────────────────────────────────────────────────────────────────
  signup: async (email, password, full_name) => {
    set({ isLoading: true })
    const { data, error } = await authApi.signup(email, password, full_name)
    if (error || !data?.user) {
      set({ isLoading: false })
      return { error: error || 'Signup failed' }
    }
    const { user, session } = data
    const token = session?.access_token
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
      set({ user, token, isAuthed: true, isLoading: false })
    } else {
      // Email confirmation required — no session yet
      set({ isLoading: false })
    }
    return { error: null }
  },

  // ── logout ───────────────────────────────────────────────────────────────────
  logout: async () => {
    await authApi.logout()
    localStorage.removeItem(TOKEN_KEY)
    set({ user: null, token: null, isAuthed: false })
  },

  // ── fetchMe ──────────────────────────────────────────────────────────────────
  fetchMe: async () => {
    const token = get().token
    if (!token) return
    set({ isLoading: true })
    const { data, error } = await authApi.getMe()
    if (error || !data) {
      set({ isLoading: false })
      return
    }
    set({ user: data, isLoading: false })
  },

  // ── updateProfile ─────────────────────────────────────────────────────────────
  updateProfile: async (profileData) => {
    const { data, error } = await authApi.updateProfile(profileData)
    if (error || !data) return { error: error || 'Update failed' }
    set({ user: data })
    return { error: null }
  },

  completeOnboarding: async (preferences) => {
    const { data, error } = await authApi.completeOnboarding(preferences)
    if (error || !data) return { error: error || 'Onboarding completion failed' }
    set({ user: data })
    return { error: null }
  },

  // ── internal setter used by 401 interceptor event ────────────────────────────
  _clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ user: null, token: null, isAuthed: false })
  },
}))

// Listen for the global auth:logout event dispatched by the axios interceptor
window.addEventListener('auth:logout', () => {
  useAuthStore.getState()._clear()
})

export default useAuthStore
