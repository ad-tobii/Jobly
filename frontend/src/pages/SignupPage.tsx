import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, Info } from 'lucide-react'
import useAuthStore from '../store/authStore.js'

type Strength = {
  score: number
  label: string
  className: string
  textClassName: string
}

function passwordStrength(password: string): Strength {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1

  if (!password) return { score: 0, label: '', className: 'bg-overlay', textClassName: 'text-tertiary' }
  if (score <= 2) return { score: 1, label: 'Weak', className: 'bg-error', textClassName: 'text-error' }
  if (score === 3) return { score: 2, label: 'Fair', className: 'bg-warning', textClassName: 'text-warning' }
  if (score === 4) return { score: 3, label: 'Good', className: 'bg-info', textClassName: 'text-info' }
  return { score: 4, label: 'Strong', className: 'bg-success', textClassName: 'text-success' }
}

function friendlySignupError(error: string) {
  const lower = error.toLowerCase()
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'An account already exists for this email.'
  }
  if (lower.includes('password')) {
    return 'Password does not meet the required strength.'
  }
  if (lower.includes('email')) {
    return 'Please enter a valid email address.'
  }
  return error || 'Unable to create your account. Please try again.'
}

export default function SignupPage() {
  const navigate = useNavigate()
  const signup = useAuthStore((s) => s.signup)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const isLoading = useAuthStore((s) => s.isLoading)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const strength = useMemo(() => passwordStrength(password), [password])
  const canSubmit = useMemo(
    () => fullName.trim().length > 1 && email.trim().length > 0 && strength.score >= 2 && !isLoading,
    [email, fullName, strength.score, isLoading],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setError('')
    setNotice('')
    const result = await signup(email.trim(), password, fullName.trim())
    if (result.error) {
      setError(friendlySignupError(result.error))
      return
    }

    if (!useAuthStore.getState().isAuthed) {
      setNotice('Account created. Please check your email to confirm your account before signing in.')
      return
    }

    await fetchMe()
    navigate('/onboarding', { replace: true })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4 py-10 text-primary">
      <section className="w-full max-w-[386px] bg-surface border border-border-faint rounded-lg px-10 py-9 animate-fade-in">
        <div className="flex items-center justify-center">
          <img src="/Jobly-logo.png" alt="Jobly" className="h-7 w-7 object-contain" />
        </div>

        <h1 className="mt-7 text-center font-display text-2xl font-semibold leading-[1.2] text-primary">
          Create your account
        </h1>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4" noValidate>
          {error && (
            <div className="flex gap-2 rounded-md border border-error/60 bg-error-subtle px-3 py-2 text-[13px] leading-snug text-error">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="flex gap-2 rounded-md border border-info/60 bg-info-subtle px-3 py-2 text-[13px] leading-snug text-info">
              <Info size={15} className="mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-secondary">Full Name</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="John Doe"
              autoComplete="name"
              className="h-11 rounded-md border border-border-default bg-surface px-3 text-[14px] text-primary outline-none transition-colors duration-[120ms] placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-secondary">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="john@example.com"
              autoComplete="email"
              className="h-11 rounded-md border border-border-default bg-surface px-3 text-[14px] text-primary outline-none transition-colors duration-[120ms] placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-secondary">Password</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
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

          <div aria-live="polite" className="mt-[-4px]">
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={`h-1 rounded-full ${step <= strength.score ? strength.className : 'bg-overlay'}`}
                />
              ))}
            </div>
            <div className="mt-1.5 h-4 text-right text-[11px] font-medium">
              {strength.label && <span className={strength.textClassName}>{strength.label}</span>}
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 h-11 rounded-md bg-accent px-4 text-[14px] font-medium text-white transition-colors duration-[120ms] hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-8 text-center text-[13px] text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="text-accent transition-colors duration-[120ms] hover:text-accent-hover">
            Sign in →
          </Link>
        </p>
      </section>
    </main>
  )
}
