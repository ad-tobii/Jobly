import client, { wrap } from './client.js'

const TOKEN_KEY = 'jobly_token'
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// POST /auth/signup
export const signup = (email, password, full_name) =>
  wrap(() => client.post('/auth/signup', { email, password, full_name }))

// POST /auth/login
export const login = (email, password) =>
  wrap(() => client.post('/auth/login', { email, password }))

// POST /auth/logout
export const logout = () =>
  wrap(() => client.post('/auth/logout'))

// GET /auth/me
export const getMe = () =>
  wrap(() => client.get('/auth/me'))

// PATCH /auth/profile
export const updateProfile = (data) =>
  wrap(() => client.patch('/auth/profile', data))

// POST /auth/onboarding/complete
export const completeOnboarding = (preferences) =>
  wrap(() => client.post('/auth/onboarding/complete', { preferences }))

// Browser OAuth redirect for Gmail. The backend auth middleware accepts
// query-token auth because a top-level navigation cannot attach headers.
export const getGmailConnectUrl = (token = localStorage.getItem(TOKEN_KEY)) => {
  const url = new URL('/auth/gmail', API_BASE_URL)
  if (token) url.searchParams.set('token', token)
  return url.toString()
}
