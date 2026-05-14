import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import useAuthStore from '../store/authStore.js'

function friendlyLoginError(error: string) {
  const lower = error.toLowerCase()
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return 'Email or password is incorrect.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.'
  }
  if (lower.includes('expired')) {
    return 'Your session has expired. Please sign in again.'
  }
  return error || 'Unable to sign in. Please try again.'
}

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s: any) => s.login)
  const fetchMe = useAuthStore((s: any) => s.fetchMe)
  const isLoading = useAuthStore((s: any) => s.isLoading)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.length > 0 && !isLoading,
    [email, password, isLoading],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setError('')
    const result = await login(email.trim(), password)
    if (result.error) {
      setError(friendlyLoginError(result.error))
      return
    }

    await fetchMe()
    const profile = useAuthStore.getState().user
    navigate(profile?.onboarding_complete === false ? '/onboarding' : '/dashboard', { replace: true })
  }

  return (
    <main className="min-h-screen bg-app text-primary flex items-start justify-center px-4 pt-2 sm:pt-6">
      <section className="w-full max-w-[386px] bg-surface border border-border-faint rounded-lg px-10 py-9 animate-fade-in">
        <div className="flex items-center justify-center">
          <img src="/Jobly-logo.png" alt="Jobly" className="h-7 w-7 object-contain" />
        </div>

        <h1 className="mt-7 text-center font-display text-2xl font-semibold leading-[1.2] text-primary">
          Sign in to your account
        </h1>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4" noValidate>
          {error && (
            <div className="flex gap-2 rounded-md border border-error/60 bg-error-subtle px-3 py-2 text-[13px] leading-snug text-error">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-secondary">Email address</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              aria-invalid={!!error}
              className="h-11 rounded-md border border-border-default bg-surface px-3 text-[14px] text-primary outline-none transition-colors duration-[120ms] placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between text-[13px] text-secondary">
              <span>Password</span>
              <button
                type="button"
                className="text-[12px] text-secondary transition-colors duration-[120ms] hover:text-primary"
                onClick={() => setError('Password reset is not connected yet.')}
              >
                Forgot?
              </button>
            </span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                aria-invalid={!!error}
                className="h-11 w-full rounded-md border border-border-default bg-surface px-3 pr-10 text-[14px] text-primary outline-none transition-colors duration-[120ms] placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-secondary transition-colors duration-[120ms] hover:bg-overlay hover:text-primary"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 h-11 rounded-md bg-accent px-4 text-[14px] font-medium text-white transition-colors duration-[120ms] hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? 'Signing in...' : 'Continue'}
          </button>
        </form>

        <p className="mt-8 text-center text-[13px] text-secondary">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="text-accent transition-colors duration-[120ms] hover:text-accent-hover">
            Sign up →
          </Link>
        </p>
      </section>
    </main>
  )
}
