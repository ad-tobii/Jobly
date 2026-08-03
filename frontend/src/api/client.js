import axios from 'axios'

const TOKEN_KEY = 'jobly_token'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach token ────────────────────────────────────────
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: handle 401 ─────────────────────────────────────────
client.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only bounce to login for a genuinely rejected session. A 401 from the
    // login form itself just means the password was wrong.
    const url = error.config?.url || ''
    const isCredentialAttempt = url.includes('/auth/login') || url.includes('/auth/signup')

    if (error.response?.status === 401 && !isCredentialAttempt) {
      localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new Event('auth:logout'))
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

/**
 * Every API call resolves to { data, error } and never throws, so call sites
 * don't need try/catch.
 *
 * The backend answers with one envelope for everything:
 *   success -> { success: true,  data: <payload> }
 *   failure -> { success: false, error: { message, code, details? } }
 * This unwraps it to the payload, or to a human-readable message.
 */
export const wrap = async (fn) => {
  try {
    const response = await fn()
    const body = response.data
    // Unwrap the envelope, tolerating a bare body in case something bypasses it.
    const data = body && typeof body === 'object' && 'success' in body ? body.data : body
    return { data, error: null }
  } catch (err) {
    return { data: null, error: errorMessage(err) }
  }
}

/** Best available human-readable message for a failed request. */
export function errorMessage(err) {
  const payload = err.response?.data?.error

  if (typeof payload === 'string') return payload
  if (payload?.message) return payload.message

  if (err.response?.status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (err.code === 'ERR_NETWORK') return 'Could not reach the server. Check your connection.'

  return err.message || 'Something went wrong.'
}

/** Field-level validation details, when the server sent them. */
export function fieldErrors(err) {
  return err.response?.data?.error?.details || []
}

export default client
