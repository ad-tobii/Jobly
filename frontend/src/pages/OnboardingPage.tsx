import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle,
  Clock3,
  FileText,
  Globe2,
  Lightbulb,
  Loader2,
  Mail,
  Target,
  Upload,
  UserRound,
  XCircle,
} from 'lucide-react'
import * as authApi from '../api/auth.js'
import * as cvsApi from '../api/cvs.js'
import useSSE from '../hooks/useSSE.js'
import useAuthStore from '../store/authStore.js'

type Mode = 'file' | 'text'
type Phase =
  | 'input'
  | 'processing'
  | 'invalid'
  | 'unsalvageable'
  | 'needs_enhancement'
  | 'questions_loading'
  | 'questions'
  | 'enhancing'
  | 'ready'
  | 'failed'

type Question = {
  id: string
  question: string
  context?: string
}

type DigestFrequency = 'daily' | 'twice_daily' | 'weekly'

const TERMINAL_STATES = ['ready', 'failed', 'invalid', 'unsalvageable', 'needs_enhancement']
const IMPROVE_CV_URL = 'https://www.topresume.com/resume-writing'
const FREQUENCIES: Array<{ value: DigestFrequency; label: string; recommended?: boolean }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'twice_daily', label: 'Twice daily', recommended: true },
  { value: 'weekly', label: 'Weekly' },
]
const TIMEZONES = ['Africa/Lagos', 'UTC', 'Europe/London', 'America/New_York', 'America/Los_Angeles']

function hasCompleteContact(user: JoblyUser | null) {
  return Boolean(user?.phone?.trim() && user?.city?.trim() && user?.country?.trim())
}

function hasUsableCV(cvs: Array<Record<string, unknown>>) {
  return cvs.some((cv) => cv.status === 'ready' || (cv.cv_health_score !== null && cv.cv_health_score !== undefined))
}

function normalizeLinkedinUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function isLinkedinUrl(value: string) {
  if (!value.trim()) return true
  try {
    const url = new URL(normalizeLinkedinUrl(value))
    return /(^|\.)linkedin\.com$/i.test(url.hostname) && url.pathname.length > 1
  } catch {
    return false
  }
}

function Stepper({ activeStep }: { activeStep: number }) {
  const steps = ['CV', 'Contact', 'Gmail', 'Prefs']
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="mb-6 flex items-center justify-center">
        <img src="/Jobly-logo.png" alt="Jobly" className="h-7 w-7 object-contain" />
      </div>
      <div className="grid grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto] items-start">
        {steps.map((step, index) => (
          <div key={step} className="contents">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                  index <= activeStep
                    ? 'border-accent bg-accent text-white'
                    : 'border-border-strong bg-app text-tertiary'
                }`}
              >
                {index < activeStep ? <Check size={12} /> : index === activeStep ? index + 1 : ''}
              </span>
              <span className={`text-[11px] ${index <= activeStep ? 'text-accent' : 'text-tertiary'}`}>{step}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`mt-2 h-px ${index < activeStep ? 'bg-accent' : 'bg-border-strong'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ProgressPanel({ title, subtitle, mode = 'processing' }: { title: string; subtitle: string; mode?: 'processing' | 'enhancing' }) {
  return (
    <div className="flex min-h-[292px] flex-col items-center justify-center rounded-lg border border-border-faint bg-surface px-8 py-10 text-center animate-fade-in">
      <Loader2 size={28} className="mb-6 animate-spin text-accent" />
      <h2 className="text-[17px] font-semibold text-primary">{title}</h2>
      <p className="mt-2 text-[13px] text-secondary">{subtitle}</p>
      <div className="mt-6 h-1 w-[210px] overflow-hidden rounded-full bg-overlay">
        <div className={`h-full rounded-full bg-accent ${mode === 'enhancing' ? 'w-3/5' : 'w-2/5'}`} />
      </div>
      <p className="mt-5 text-[11px] text-tertiary">
        {mode === 'enhancing' ? 'Note: This usually takes about 30 seconds.' : 'Validating document format...'}
      </p>
    </div>
  )
}

function ResultPanel({
  phase,
  summary,
  score,
  onRetry,
  onEnhance,
  onSkip,
  onContinue,
}: {
  phase: Phase
  summary: string
  score?: number | null
  onRetry: () => void
  onEnhance: () => void
  onSkip: () => void
  onContinue: () => void
}) {
  if (phase === 'invalid') {
    return (
      <div className="rounded-lg border border-error/60 bg-surface px-8 py-10 text-center animate-fade-in">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-error-subtle text-error">
          <XCircle size={22} />
        </div>
        <h2 className="mt-7 text-[20px] font-semibold text-primary">This doesn&apos;t appear to be a CV</h2>
        <p className="mx-auto mt-3 max-w-[420px] text-[14px] italic leading-relaxed text-secondary">
          {summary || "We scanned your document but couldn't find the expected structure or content typically associated with a professional resume."}
        </p>
        <p className="mt-5 text-[12px] text-tertiary">Please upload a PDF containing your professional history.</p>
        <button onClick={onRetry} className="mt-8 h-10 w-full rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover">
          Try Again
        </button>
      </div>
    )
  }

  if (phase === 'unsalvageable') {
    return (
      <div className="rounded-lg border border-warning/60 bg-surface px-8 py-10 text-center animate-fade-in">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-warning-subtle text-warning">
          <AlertTriangle size={22} />
        </div>
        <h2 className="mt-7 text-[20px] font-semibold text-primary">Your CV needs significant work</h2>
        <p className="mx-auto mt-3 max-w-[430px] text-[14px] italic leading-relaxed text-secondary">
          {summary || 'Our analysis indicates critical missing sections or formatting issues that will likely result in immediate rejection by ATS systems.'}
        </p>
        <a
          href={IMPROVE_CV_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-8 flex h-10 w-full items-center justify-center rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover"
        >
          Improve my CV ↗
        </a>
        <button onClick={onRetry} className="mt-3 h-10 w-full rounded-md border border-border-default text-[14px] font-medium text-secondary hover:bg-overlay hover:text-primary">
          Try a different CV
        </button>
      </div>
    )
  }

  if (phase === 'needs_enhancement') {
    return (
      <div className="rounded-lg border border-accent-muted bg-surface px-8 py-10 text-center animate-fade-in">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-info-subtle text-info">
          <Lightbulb size={22} />
        </div>
        <h2 className="mt-7 text-[20px] font-semibold text-primary">Your CV could be stronger</h2>
        <p className="mx-auto mt-3 max-w-[430px] text-[14px] italic leading-relaxed text-secondary">
          {summary || 'It looks good, but a few quantified achievements and stronger action verbs could increase your impact.'}
        </p>
        <button onClick={onEnhance} className="mt-8 h-10 w-full rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover">
          Enhance with AI
        </button>
        <button onClick={onSkip} className="mt-3 h-10 w-full rounded-md border border-border-default text-[14px] font-medium text-secondary hover:bg-overlay hover:text-primary">
          Proceed anyway
        </button>
      </div>
    )
  }

  if (phase === 'ready') {
    const health = score ?? 0
    return (
      <div className="rounded-lg border border-success/60 bg-surface px-8 py-10 text-center animate-fade-in">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-success-subtle text-success">
          <CheckCircle size={22} />
        </div>
        <h2 className="mt-7 text-[20px] font-semibold text-primary">Looking good!</h2>
        <p className="mx-auto mt-3 max-w-[430px] text-[14px] leading-relaxed text-secondary">
          Your CV has been processed, enhanced, and scored against industry benchmarks. You&apos;re ready for the next step.
        </p>
        <div className="mt-7 rounded-md bg-app px-4 py-3 text-left">
          <div className="flex items-center justify-between text-[13px] font-medium">
            <span className="text-primary">Health Score</span>
            <span className="text-success">{health} <span className="text-tertiary">/ 100</span></span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-overlay">
            <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(health, 100)}%` }} />
          </div>
        </div>
        <button onClick={onContinue} className="mt-8 h-10 w-full rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover">
          Continue
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-error/60 bg-surface px-8 py-10 text-center">
      <h2 className="text-[20px] font-semibold text-primary">CV processing failed</h2>
      <p className="mt-3 text-[14px] text-secondary">Something went wrong while processing your CV. Please try again.</p>
      <button onClick={onRetry} className="mt-8 h-10 w-full rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover">
        Try Again
      </button>
    </div>
  )
}

function ContactStep({ onContinue }: { onContinue: () => void }) {
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const user = useAuthStore((s) => s.user)

  const [phone, setPhone] = useState(user?.phone || '')
  const [city, setCity] = useState(user?.city || '')
  const [country, setCountry] = useState(user?.country || '')
  const [linkedinUrl, setLinkedinUrl] = useState(user?.linkedin_url || '')
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const inputClass = (field: string) =>
    `h-10 rounded-md border bg-surface px-3 text-[13px] text-primary outline-none transition-colors duration-[120ms] placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45 ${
      errors[field] ? 'border-error' : 'border-border-default'
    }`

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    if (!phone.trim()) nextErrors.phone = 'Phone number is required'
    if (!city.trim()) nextErrors.city = 'City is required'
    if (!country.trim()) nextErrors.country = 'Country is required'
    if (!isLinkedinUrl(linkedinUrl)) {
      nextErrors.linkedin_url = 'Enter a valid LinkedIn URL'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate()) return

    setIsSaving(true)

    const normalizedLinkedin = linkedinUrl.trim()
    const result = await updateProfile({
      phone: phone.trim(),
      city: city.trim(),
      country: country.trim(),
      linkedin_url: normalizedLinkedin || null,
    })

    setIsSaving(false)
    if (result.error) {
      setErrors({ form: result.error })
      return
    }

    onContinue()
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border-faint bg-surface px-8 py-7 animate-fade-in">
      <div className="flex items-start gap-4">
        <UserRound size={18} className="mt-1 text-accent" />
        <div>
          <h1 className="text-[20px] font-semibold text-primary">Tell us a bit about yourself</h1>
          <p className="mt-1 text-[13px] text-secondary">This appears on your tailored CVs.</p>
        </div>
      </div>

      <div className="mt-7 grid gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-secondary">Phone Number</span>
          <input
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value)
              setErrors((current) => ({ ...current, phone: '' }))
            }}
            placeholder="+234 800 000 0000"
            autoComplete="tel"
            className={inputClass('phone')}
          />
          {errors.phone && <span className="text-[11px] text-error">{errors.phone}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-[13px] text-secondary">
            <span>LinkedIn URL</span>
            <span className="text-[11px] text-tertiary">(optional)</span>
          </span>
          <input
            value={linkedinUrl}
            onChange={(event) => {
              setLinkedinUrl(event.target.value)
              setErrors((current) => ({ ...current, linkedin_url: '' }))
            }}
            placeholder="linkedin.com/in/your-handle"
            autoComplete="url"
            className={inputClass('linkedin_url')}
          />
          {errors.linkedin_url && <span className="text-[11px] text-error">{errors.linkedin_url}</span>}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-secondary">
              City
            </span>
            <input
              value={city}
              onChange={(event) => {
                setCity(event.target.value)
                setErrors((current) => ({ ...current, city: '' }))
              }}
              placeholder="Lagos"
              autoComplete="address-level2"
              className={inputClass('city')}
            />
            {errors.city && <span className="text-[11px] text-error">{errors.city}</span>}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-secondary">Country</span>
            <input
              value={country}
              onChange={(event) => {
                setCountry(event.target.value)
                setErrors((current) => ({ ...current, country: '' }))
              }}
              placeholder="Nigeria"
              autoComplete="country-name"
              className={inputClass('country')}
            />
            {errors.country && <span className="text-[11px] text-error">{errors.country}</span>}
          </label>
        </div>
      </div>

      {errors.form && <p className="mt-4 text-[13px] text-error">{errors.form}</p>}

      <button
        type="submit"
        disabled={isSaving}
        className="mt-8 h-10 w-full rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSaving ? 'Saving...' : 'Continue'}
      </button>
    </form>
  )
}

function GmailStep({ onContinue }: { onContinue: () => void }) {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const [searchParams, setSearchParams] = useSearchParams()
  const [isConnecting, setIsConnecting] = useState(false)
  const [message, setMessage] = useState('')

  const gmailStatus = searchParams.get('gmail')
  const isConnected = Boolean(user?.gmail_connected)

  useEffect(() => {
    let cancelled = false

    const refreshAfterCallback = async () => {
      if (gmailStatus !== 'connected' && gmailStatus !== 'error') return

      if (gmailStatus === 'connected') {
        await fetchMe()
      }

      if (cancelled) return

      setMessage(
        gmailStatus === 'connected'
          ? 'Gmail connected successfully.'
          : 'We could not connect Gmail. Please try again or skip this step.'
      )
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.delete('gmail')
        return next
      }, { replace: true })
    }

    refreshAfterCallback()

    return () => {
      cancelled = true
    }
  }, [fetchMe, gmailStatus, setSearchParams])

  const handleConnect = () => {
    if (!token) {
      setMessage('Your session has expired. Please log in again before connecting Gmail.')
      return
    }

    setIsConnecting(true)
    window.location.href = authApi.getGmailConnectUrl(token)
  }

  if (isConnected) {
    return (
      <div className="rounded-lg border border-border-faint bg-surface px-8 py-8 text-center animate-fade-in">
        <CheckCircle size={18} className="mx-auto text-success" />
        <h1 className="mt-3 text-[18px] font-semibold text-primary">Gmail connected</h1>
        <p className="mt-5 text-[13px] text-secondary">{user?.email}</p>
        <p className="mx-auto mt-7 max-w-[400px] text-[13px] leading-relaxed text-secondary">
          We&apos;ll automatically pick up LinkedIn job alerts from your inbox.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-7 h-10 w-full rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover"
        >
          Continue
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border-faint bg-surface px-8 py-8 text-center animate-fade-in">
      <Mail size={28} className="mx-auto text-accent" />
      <h1 className="mt-5 text-[20px] font-semibold text-primary">Connect your Gmail</h1>
      <p className="mx-auto mt-2 max-w-[330px] text-[13px] leading-relaxed text-secondary">
        We&apos;ll watch for LinkedIn job alert emails and automatically add them to your dashboard.
      </p>

      {message && (
        <p className={`mt-6 text-[13px] ${message.includes('successfully') ? 'text-success' : 'text-error'}`}>
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={handleConnect}
        disabled={isConnecting}
        className="mt-7 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-[13px] font-bold">G</span>
        {isConnecting ? 'Connecting...' : 'Connect Gmail'}
      </button>
      <button
        type="button"
        onClick={onContinue}
        className="mt-4 text-[12px] font-medium text-secondary hover:text-primary"
      >
        Skip for now
      </button>
    </div>
  )
}

function PreferencesStep() {
  const navigate = useNavigate()
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding)
  const user = useAuthStore((s) => s.user)
  const existingPreferences = user?.preferences || {}
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const defaultTimezone = existingPreferences.timezone || (TIMEZONES.includes(browserTimezone) ? browserTimezone : 'Africa/Lagos')

  const [frequency, setFrequency] = useState<DigestFrequency>(existingPreferences.digest_frequency || 'twice_daily')
  const [digestTime, setDigestTime] = useState(existingPreferences.digest_time || '08:00')
  const [timezone, setTimezone] = useState(defaultTimezone)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleComplete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSaving(true)

    const result = await completeOnboarding({
      digest_frequency: frequency,
      digest_time: digestTime,
      timezone,
    })

    setIsSaving(false)

    if (result.error) {
      setError(result.error)
      return
    }

    navigate('/dashboard', { replace: true })
  }

  return (
    <form onSubmit={handleComplete} className="rounded-lg border border-border-faint bg-surface px-8 py-8 animate-fade-in">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-accent-subtle text-accent">
          <Bell size={20} />
        </div>
        <h1 className="mt-6 text-[20px] font-semibold text-primary">When should we send you digests?</h1>
        <p className="mt-2 text-[13px] text-secondary">We batch your ready applications into one clean summary email.</p>
      </div>

      <div className="mt-7 grid gap-3">
        {FREQUENCIES.map((item) => {
          const selected = frequency === item.value
          return (
            <label
              key={item.value}
              className={`flex h-12 cursor-pointer items-center justify-between rounded-md border px-4 transition-colors duration-[120ms] ${
                selected
                  ? 'border-accent bg-accent-subtle text-primary'
                  : 'border-border-default bg-surface text-secondary hover:border-border-strong hover:text-primary'
              }`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="digest_frequency"
                  value={item.value}
                  checked={selected}
                  onChange={() => setFrequency(item.value)}
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-[13px] font-medium">{item.label}</span>
              </span>
              {item.recommended && (
                <span className="rounded-sm bg-accent-muted px-2 py-1 text-[10px] font-medium text-accent">
                  Recommended
                </span>
              )}
            </label>
          )
        })}
      </div>

      <div className="mt-7 border-t border-border-faint pt-6">
        <div className="grid gap-4 sm:grid-cols-[96px_1fr]">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-secondary">Preferred time</span>
            <div className="relative">
              <Clock3 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input
                type="time"
                value={digestTime}
                onChange={(event) => setDigestTime(event.target.value)}
                className="h-10 w-full rounded-md border border-border-default bg-app pl-9 pr-2 text-[13px] font-semibold text-primary outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-secondary">Timezone</span>
            <div className="relative">
              <Globe2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="h-10 w-full appearance-none rounded-md border border-border-default bg-app pl-9 pr-8 text-[13px] font-semibold text-primary outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
              >
                {[...new Set([defaultTimezone, ...TIMEZONES])].map((zone) => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-secondary">v</span>
            </div>
          </label>
        </div>
      </div>

      {error && <p className="mt-5 text-[13px] text-error">{error}</p>}

      <button
        type="submit"
        disabled={isSaving}
        className="mt-7 h-11 w-full rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? 'Saving preferences...' : 'Go to Dashboard'}
      </button>
    </form>
  )
}

export default function OnboardingPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const [activeStep, setActiveStep] = useState(0)
  const [isResolvingStep, setIsResolvingStep] = useState(true)
  const [mode, setMode] = useState<Mode>('file')
  const [phase, setPhase] = useState<Phase>('input')
  const [label, setLabel] = useState('')
  const [rawText, setRawText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [cvId, setCvId] = useState<string | null>(null)
  const [streamRun, setStreamRun] = useState(0)
  const [summary, setSummary] = useState('')
  const [score, setScore] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const streamUrl = cvId && ['processing', 'enhancing'].includes(phase)
    ? `/cv/${cvId}/status-stream?run=${streamRun}`
    : ''
  const stream = useSSE(streamUrl, TERMINAL_STATES)

  useEffect(() => {
    let cancelled = false

    const resolveStep = async () => {
      setIsResolvingStep(true)
      await fetchMe()

      const latestUser = useAuthStore.getState().user
      const { data: cvs } = await cvsApi.listCVs()

      if (cancelled) return

      const cvComplete = Array.isArray(cvs) && hasUsableCV(cvs)
      if (!cvComplete) {
        setActiveStep(0)
      } else if (!hasCompleteContact(latestUser)) {
        setActiveStep(1)
      } else if (latestUser?.gmail_connected) {
        setActiveStep(3)
      } else {
        setActiveStep(2)
      }

      setIsResolvingStep(false)
    }

    resolveStep()

    return () => {
      cancelled = true
    }
  }, [fetchMe])

  useEffect(() => {
    if (!stream.data?.status) return

    const data = stream.data
    if (data.status === 'invalid') {
      setSummary(data.rejection_reason || '')
      setPhase('invalid')
    } else if (data.status === 'unsalvageable') {
      setSummary(data.quality_summary || '')
      setPhase('unsalvageable')
    } else if (data.status === 'needs_enhancement') {
      setSummary(data.quality_summary || '')
      setPhase('needs_enhancement')
    } else if (data.status === 'ready') {
      setScore(data.cv_health_score ?? null)
      setPhase('ready')
    } else if (data.status === 'failed') {
      setPhase('failed')
    }
  }, [stream.data])

  const canSubmit = useMemo(() => {
    if (!label.trim()) return false
    if (mode === 'file') return !!file
    return rawText.trim().length >= 100
  }, [file, label, mode, rawText])

  const resetFlow = () => {
    setPhase('input')
    setFile(null)
    setRawText('')
    setCvId(null)
    setSummary('')
    setScore(null)
    setError('')
    setQuestions([])
    setAnswers({})
  }

  const handleFile = (nextFile?: File) => {
    if (!nextFile) return
    if (nextFile.type !== 'application/pdf') {
      setError('Only PDF files are supported.')
      return
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setError('PDF must be 10MB or smaller.')
      return
    }
    setError('')
    setFile(nextFile)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setError('')
    setPhase('processing')
    const response = mode === 'file' && file
      ? await cvsApi.uploadPDF(file, label.trim())
      : await cvsApi.submitText(label.trim(), rawText.trim())

    if (response.error || !response.data?.cv_id) {
      setError(response.error || 'CV submission failed.')
      setPhase('input')
      return
    }

    setCvId(response.data.cv_id)
    setStreamRun((run) => run + 1)
  }

  const handleEnhance = async () => {
    if (!cvId) return
    setPhase('questions_loading')
    setError('')
    const response = await cvsApi.getQuestions(cvId)
    if (response.error || !Array.isArray(response.data?.questions)) {
      setError(response.error || 'Failed to generate enhancement questions.')
      setPhase('needs_enhancement')
      return
    }
    setQuestions(response.data.questions)
    setAnswers(Object.fromEntries(response.data.questions.map((q: Question) => [q.id, ''])))
    setPhase('questions')
  }

  const handleApplyEnhancement = async () => {
    if (!cvId) return
    setPhase('enhancing')
    setError('')
    const payload = questions.map((question) => ({
      id: question.id,
      answer: answers[question.id]?.trim() || '',
    }))
    const response = await cvsApi.applyEnhancement(cvId, questions, payload)
    if (response.error) {
      setError(response.error)
      setPhase('questions')
      return
    }
    setStreamRun((run) => run + 1)
  }

  const handleSkipEnhancement = async () => {
    if (!cvId) return
    setPhase('processing')
    setError('')
    const response = await cvsApi.skipEnhancement(cvId)
    if (response.error) {
      setError(response.error)
      setPhase('needs_enhancement')
      return
    }
    setStreamRun((run) => run + 1)
  }

  return (
    <main className="min-h-screen bg-app px-4 py-6 text-primary">
      <Stepper activeStep={activeStep} />

      <section className="mx-auto mt-7 w-full max-w-[540px]">
        {isResolvingStep && (
          <ProgressPanel title="Preparing onboarding..." subtitle="Checking what you have already completed..." />
        )}

        {!isResolvingStep && activeStep === 0 && phase === 'input' && (
          <form onSubmit={handleSubmit} className="rounded-lg border border-border-faint bg-surface p-6 animate-fade-in">
            <div className="flex items-start gap-4">
              <FileText size={20} className="mt-1 text-secondary" />
              <div>
                <h1 className="text-[20px] font-semibold text-primary">Let&apos;s start with your CV</h1>
                <p className="mt-1 text-[13px] text-secondary">We&apos;ll use this to match and tailor your applications.</p>
              </div>
            </div>

            <div className="mt-6">
              <label className="text-[13px] text-secondary" htmlFor="cv-label">CV Name</label>
              <input
                id="cv-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Software Engineer 2024"
                className="mt-1.5 h-11 w-full rounded-md border border-border-default bg-surface px-3 text-[14px] text-primary outline-none placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
              />
              <p className="mt-1.5 text-[11px] text-tertiary">e.g. “Full Stack CV”, “Automation CV”</p>
            </div>

            <div className="mt-5 grid grid-cols-2 rounded-md border border-border-default bg-app p-0.5">
              <button
                type="button"
                onClick={() => setMode('file')}
                className={`h-9 rounded-[4px] text-[13px] font-medium ${mode === 'file' ? 'bg-accent text-white' : 'text-secondary hover:bg-overlay hover:text-primary'}`}
              >
                Upload PDF
              </button>
              <button
                type="button"
                onClick={() => setMode('text')}
                className={`h-9 rounded-[4px] text-[13px] font-medium ${mode === 'text' ? 'bg-accent text-white' : 'text-secondary hover:bg-overlay hover:text-primary'}`}
              >
                Paste Text
              </button>
            </div>

            {mode === 'file' ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => event.key === 'Enter' && fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  handleFile(event.dataTransfer.files[0])
                }}
                className="mt-6 flex min-h-[146px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border-strong bg-app px-6 text-center transition-colors duration-[120ms] hover:border-accent-muted"
              >
                <Upload size={26} className="text-secondary" />
                <p className="mt-4 text-[14px] text-secondary">
                  {file ? file.name : <>Drag your CV here or <span className="text-accent">click to browse</span></>}
                </p>
                <p className="mt-1 text-[11px] text-tertiary">PDF only · Max 10MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => handleFile(event.target.files?.[0])}
                />
              </div>
            ) : (
              <textarea
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                placeholder="Paste your CV text here..."
                className="mt-6 min-h-[170px] w-full resize-none rounded-md border border-border-default bg-app px-3 py-3 text-[14px] leading-relaxed text-primary outline-none placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
              />
            )}

            {error && <p className="mt-4 text-[13px] text-error">{error}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-6 h-10 w-full rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Upload & Continue
            </button>
          </form>
        )}

        {!isResolvingStep && activeStep === 0 && phase === 'processing' && <ProgressPanel title="Processing your CV..." subtitle="Running health checks and preparing your profile..." />}
        {!isResolvingStep && activeStep === 0 && phase === 'questions_loading' && <ProgressPanel title="Analysing your CV..." subtitle="Generating targeted questions..." />}
        {!isResolvingStep && activeStep === 0 && phase === 'enhancing' && <ProgressPanel title="Enhancing your CV..." subtitle="Incorporating your answers..." mode="enhancing" />}

        {!isResolvingStep && activeStep === 0 && ['invalid', 'unsalvageable', 'needs_enhancement', 'ready', 'failed'].includes(phase) && (
          <ResultPanel
            phase={phase}
            summary={summary}
            score={score}
            onRetry={resetFlow}
            onEnhance={handleEnhance}
            onSkip={handleSkipEnhancement}
            onContinue={() => setActiveStep(1)}
          />
        )}

        {!isResolvingStep && activeStep === 0 && phase === 'questions' && (
          <div className="rounded-lg border border-accent-muted bg-surface p-6 animate-fade-in">
            <div className="flex items-center gap-3">
              <Target size={20} className="text-accent" />
              <h1 className="text-[20px] font-semibold text-primary">A few quick questions</h1>
            </div>

            <div className="mt-6 flex flex-col gap-5">
              {questions.map((question) => (
                <label key={question.id} className="flex flex-col gap-2">
                  <span className="text-[13px] font-medium text-primary">{question.question}</span>
                  {question.context && <span className="text-[12px] italic text-tertiary">Context: {question.context}</span>}
                  <textarea
                    value={answers[question.id] || ''}
                    onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                    placeholder="e.g. Increased Q3 revenue by 15%..."
                    className="min-h-[76px] resize-none rounded-md border border-border-default bg-app px-3 py-3 text-[14px] leading-relaxed text-primary outline-none placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
                  />
                </label>
              ))}
            </div>

            {error && <p className="mt-4 text-[13px] text-error">{error}</p>}

            <div className="mt-8 grid grid-cols-2 gap-3">
              <button onClick={handleSkipEnhancement} className="h-10 rounded-md border border-border-default text-[14px] font-medium text-secondary hover:bg-overlay hover:text-primary">
                Skip
              </button>
              <button onClick={handleApplyEnhancement} className="h-10 rounded-md bg-accent text-[14px] font-medium text-white hover:bg-accent-hover">
                Enhance My CV
              </button>
            </div>
          </div>
        )}

        {!isResolvingStep && stream.error && ['processing', 'enhancing'].includes(phase) && (
          <p className="mt-4 text-center text-[13px] text-warning">Still waiting for updates. If this takes too long, try again.</p>
        )}

        {!isResolvingStep && activeStep === 1 && <ContactStep onContinue={() => setActiveStep(2)} />}

        {!isResolvingStep && activeStep === 2 && <GmailStep onContinue={() => setActiveStep(3)} />}

        {!isResolvingStep && activeStep === 3 && (
          <PreferencesStep />
        )}
      </section>
    </main>
  )
}
