import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileText,
  Filter,
  Loader2,
  MoreVertical,
  Plus,
  Send,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import * as jobsApi from '../api/jobs.js'
import useSSE from '../hooks/useSSE.js'
import useToastStore from '../store/toastStore.js'

type Timeline = 'today' | 'weekly' | 'monthly' | 'all_time'
type TabKey = 'all' | 'scoring' | 'recommended' | 'ready' | 'applied'
type AddMode = 'url' | 'paste'

type DashboardJob = {
  id: string
  title?: string | null
  company?: string | null
  location?: string | null
  logo_url?: string | null
  source_type?: string | null
  source_url?: string | null
  match_score?: number | null
  status: string
  selected_cv_id?: string | null
  created_at: string
  updated_at?: string | null
  job_cv_matches?: Array<{ cv_id: string; score: number; recommended?: boolean }>
  documents?: Array<{ id: string; tailored_cv_url?: string | null; cover_letter_url?: string | null }>
}

type DashboardData = {
  timeline: Timeline
  stats: {
    total_jobs: number
    recommended: number
    ready: number
    applied: number
    scoring: number
  }
  jobs: DashboardJob[]
}

const TIMELINES: Array<{ value: Timeline; label: string; short: string }> = [
  { value: 'today', label: 'Today', short: 'today' },
  { value: 'weekly', label: 'Weekly', short: 'this week' },
  { value: 'monthly', label: 'Monthly', short: 'this month' },
  { value: 'all_time', label: 'All time', short: 'all time' },
]

const TABS: Array<{ value: TabKey; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'scoring', label: 'Scoring' },
  { value: 'recommended', label: 'Recommended' },
  { value: 'ready', label: 'Ready' },
  { value: 'applied', label: 'Applied' },
]

const SCORING_STATUSES = ['scraping', 'scraped', 'scoring', 'generating']
const TERMINAL_STATES = ['recommended', 'low_match', 'ready', 'failed']

const emptyData: DashboardData = {
  timeline: 'weekly',
  stats: {
    total_jobs: 0,
    recommended: 0,
    ready: 0,
    applied: 0,
    scoring: 0,
  },
  jobs: [],
}

function isScoring(job: DashboardJob) {
  return SCORING_STATUSES.includes(job.status)
}

function bestScore(job: DashboardJob) {
  if (typeof job.match_score === 'number') return job.match_score
  return job.job_cv_matches?.reduce((max, match) => Math.max(max, match.score || 0), 0) || null
}

function formatJobTitle(job: DashboardJob) {
  if (job.title?.trim()) return job.title
  if (job.status === 'scraping') return 'Reading LinkedIn job...'
  return 'Untitled role'
}

function formatCompanyLine(job: DashboardJob) {
  const company = job.company?.trim() || 'Unknown company'
  return job.location ? `${company} • ${job.location}` : company
}

function relativeAge(value?: string | null) {
  if (!value) return ''
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(diffMs / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function JobLogo({ job }: { job: DashboardJob }) {
  if (job.logo_url) {
    return <img src={job.logo_url} alt="" className="h-9 w-9 rounded-md object-cover" />
  }

  const Icon = job.status === 'applied' ? Check : job.status === 'ready' ? FileText : Briefcase
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-app">
      <Icon size={18} />
    </div>
  )
}

function StatusPill({ job }: { job: DashboardJob }) {
  const score = bestScore(job)

  if (isScoring(job)) {
    return (
      <div className="min-w-[158px]">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-accent">
          <span>{job.status === 'generating' ? 'Generating docs...' : 'AI scoring...'}</span>
          <span>{score ? `${score}% match` : 'Working'}</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-overlay">
          <div className="h-full w-3/5 rounded-full bg-accent" />
        </div>
      </div>
    )
  }

  if (job.status === 'recommended') {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-default bg-app px-2.5 text-[12px] font-semibold text-primary">
        <Sparkles size={13} className="text-accent" />
        {score || 0}% Match
      </span>
    )
  }

  if (job.status === 'ready') {
    return (
      <span className="inline-flex h-7 items-center rounded-md bg-warning-subtle px-2.5 text-[11px] font-bold uppercase text-warning">
        Ready
      </span>
    )
  }

  if (job.status === 'applied') {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-success-subtle px-2.5 text-[11px] font-bold uppercase text-success">
        <Check size={12} />
        Applied
      </span>
    )
  }

  if (job.status === 'low_match') {
    return (
      <span className="inline-flex h-7 items-center rounded-md bg-error-subtle px-2.5 text-[11px] font-bold uppercase text-error">
        Low match
      </span>
    )
  }

  return (
    <span className="inline-flex h-7 items-center rounded-md bg-overlay px-2.5 text-[11px] font-bold uppercase text-secondary">
      {job.status}
    </span>
  )
}

function JobStreamListener({ jobId, onUpdate }: { jobId: string; onUpdate: () => void }) {
  const stream = useSSE(`/jobs/${jobId}/status-stream`, TERMINAL_STATES)

  useEffect(() => {
    if (!stream.data?.status) return
    onUpdate()
  }, [onUpdate, stream.data])

  return null
}

function AddJobModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onCreated: (jobId?: string) => void
}) {
  const toastError = useToastStore((s: any) => s.error)
  const [mode, setMode] = useState<AddMode>('url')
  const [url, setUrl] = useState('')
  const [rawText, setRawText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const canSubmit = mode === 'url'
    ? url.trim().length > 0 && !isSubmitting
    : rawText.trim().length >= 100 && !isSubmitting

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setError('')
    setIsSubmitting(true)

    const response = mode === 'url'
      ? await jobsApi.submitUrl(url.trim())
      : await jobsApi.submitPaste(rawText.trim())

    setIsSubmitting(false)

    if (response.error) {
      const message = response.error || 'Unable to add this job.'
      setError(message)
      toastError(message)
      return
    }

    setUrl('')
    setRawText('')
    onCreated(response.data?.job_id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="w-full max-w-[510px] rounded-lg border border-border-default bg-surface p-5 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-primary">Add a Job</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-secondary hover:bg-overlay hover:text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 rounded-md border border-border-default bg-app p-0.5">
          <button
            type="button"
            onClick={() => {
              setMode('url')
              setError('')
            }}
            className={`flex h-9 items-center justify-center gap-2 rounded-[4px] text-[13px] font-medium ${
              mode === 'url' ? 'bg-surface text-primary' : 'text-secondary hover:text-primary'
            }`}
          >
            <Send size={13} />
            LinkedIn URL
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('paste')
              setError('')
            }}
            className={`flex h-9 items-center justify-center gap-2 rounded-[4px] text-[13px] font-medium ${
              mode === 'paste' ? 'bg-surface text-primary' : 'text-secondary hover:text-primary'
            }`}
          >
            <ClipboardCheck size={13} />
            Paste Job
          </button>
        </div>

        {mode === 'url' ? (
          <label className="mt-5 flex flex-col gap-1.5">
            <span className="text-[12px] text-secondary">LinkedIn Job URL</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://linkedin.com/jobs/view/..."
              className="h-10 rounded-md border border-border-default bg-app px-3 text-[13px] text-primary outline-none placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
            />
          </label>
        ) : (
          <label className="mt-5 flex flex-col gap-1.5">
            <span className="text-[12px] text-secondary">Job description</span>
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="Paste the job description here..."
              className="min-h-[138px] resize-none rounded-md border border-border-default bg-app px-3 py-3 text-[13px] leading-relaxed text-primary outline-none placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
            />
            <span className="text-[11px] text-tertiary">Minimum 100 characters.</span>
          </label>
        )}

        {error && <p className="mt-4 text-[13px] text-error">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          {isSubmitting ? 'Adding...' : 'Add Job'}
        </button>
      </form>
    </div>
  )
}

export default function DashboardPage() {
  const toastSuccess = useToastStore((s: any) => s.success)
  const toastError = useToastStore((s: any) => s.error)
  const [timeline, setTimeline] = useState<Timeline>('weekly')
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [data, setData] = useState<DashboardData>(emptyData)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)

  const selectedTimeline = TIMELINES.find((item) => item.value === timeline) || TIMELINES[1]

  const loadDashboard = useCallback(async () => {
    setIsLoading(true)
    const response = await jobsApi.getDashboard({ timeline })
    setIsLoading(false)

    if (response.error || !response.data) {
      const message = response.error || 'Unable to load dashboard.'
      setError(message)
      toastError(message)
      return
    }

    setError('')
    setData(response.data)
  }, [timeline, toastError])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const visibleJobs = useMemo(() => {
    return data.jobs.filter((job) => {
      if (activeTab === 'all') return true
      if (activeTab === 'scoring') return isScoring(job)
      return job.status === activeTab
    })
  }, [activeTab, data.jobs])

  const streamingJobs = useMemo(
    () => data.jobs.filter((job) => isScoring(job)).map((job) => job.id),
    [data.jobs],
  )

  const handleCreated = (jobId?: string) => {
    toastSuccess('Job added. Jobly is processing it now.')
    loadDashboard()
    if (jobId) setActiveTab('scoring')
  }

  return (
    <div className="min-h-screen bg-app text-primary">
      {streamingJobs.map((jobId) => (
        <JobStreamListener key={jobId} jobId={jobId} onUpdate={loadDashboard} />
      ))}

      <header className="flex h-14 items-center justify-end border-b border-border-faint px-7">
        <div className="flex items-center gap-3 text-secondary">
          <Clock3 size={15} />
          <span className="h-7 w-7 rounded-full border border-border-default bg-surface" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1060px] px-7 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[24px] font-semibold leading-tight text-primary">Dashboard</h1>
            <p className="mt-1 text-[13px] text-secondary">Overview of your application pipeline.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsFilterOpen((value) => !value)}
                className="flex h-10 items-center gap-2 rounded-md border border-border-default bg-app px-3 text-[13px] font-medium text-primary hover:bg-overlay"
              >
                <Filter size={14} />
                {selectedTimeline.label}
                <ChevronDown size={14} className="text-secondary" />
              </button>
              {isFilterOpen && (
                <div className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-md border border-border-default bg-surface shadow-xl">
                  {TIMELINES.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setTimeline(item.value)
                        setIsFilterOpen(false)
                      }}
                      className={`flex h-9 w-full items-center justify-between px-3 text-left text-[13px] hover:bg-overlay ${
                        timeline === item.value ? 'text-accent' : 'text-secondary'
                      }`}
                    >
                      {item.label}
                      {timeline === item.value && <Check size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-hover"
            >
              <Plus size={15} />
              Add Job
            </button>
          </div>
        </div>

        <section className="mt-7 grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-border-faint bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-secondary">Total jobs</span>
              <Briefcase size={15} className="text-tertiary" />
            </div>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-[32px] font-semibold leading-none">{data.stats.total_jobs}</span>
              <span className="mb-1 rounded-sm bg-success-subtle px-2 py-1 text-[11px] font-medium text-success">
                {selectedTimeline.short}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-accent-muted bg-accent-subtle p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-accent">Recommended</span>
              <Target size={15} className="text-accent" />
            </div>
            <p className="mt-4 text-[32px] font-semibold leading-none">{data.stats.recommended}</p>
          </div>

          <div className="rounded-lg border border-border-faint bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-warning">Ready</span>
              <span className="h-3 w-3 rounded-full bg-warning" />
            </div>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-[32px] font-semibold leading-none">{data.stats.ready}</span>
              <span className="mb-1 text-[12px] text-secondary">Action required</span>
            </div>
          </div>

          <div className="rounded-lg border border-border-faint bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-secondary">Applied</span>
              <Send size={15} className="text-tertiary" />
            </div>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-[32px] font-semibold leading-none">{data.stats.applied}</span>
              <span className="mb-1 text-[12px] text-secondary">Awaiting response</span>
            </div>
          </div>
        </section>

        <section className="mt-7">
          <div className="flex border-b border-border-faint">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`mr-6 h-10 border-b-2 text-[13px] font-medium ${
                  activeTab === tab.value
                    ? 'border-accent text-primary'
                    : 'border-transparent text-secondary hover:text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-border-faint bg-surface">
            {isLoading && (
              <div className="flex h-40 items-center justify-center gap-2 text-secondary">
                <Loader2 size={18} className="animate-spin text-accent" />
                Loading dashboard...
              </div>
            )}

            {!isLoading && error && (
              <div className="flex h-40 items-center justify-center px-4 text-center text-[13px] text-error">
                {error}
              </div>
            )}

            {!isLoading && !error && visibleJobs.length === 0 && (
              <div className="flex h-44 flex-col items-center justify-center px-4 text-center">
                <Briefcase size={24} className="text-tertiary" />
                <p className="mt-3 text-[14px] font-medium text-primary">No jobs in this view</p>
                <p className="mt-1 text-[13px] text-secondary">Add a LinkedIn job or paste a job description to start scoring.</p>
              </div>
            )}

            {!isLoading && !error && visibleJobs.map((job) => (
              <div key={job.id} className="grid min-h-[70px] grid-cols-[1fr_auto] items-center gap-4 border-b border-border-faint px-4 last:border-b-0 hover:bg-app/50">
                <Link to={`/jobs/${job.id}`} className="flex min-w-0 items-center gap-4 no-underline">
                  <JobLogo job={job} />
                  <div className="min-w-0">
                    <h3 className="truncate text-[14px] font-semibold text-primary">{formatJobTitle(job)}</h3>
                    <p className="mt-0.5 truncate text-[12px] text-secondary">{formatCompanyLine(job)}</p>
                  </div>
                </Link>

                <div className="flex items-center gap-4">
                  {job.status === 'applied' && (
                    <span className="hidden text-[12px] text-secondary sm:inline">Applied {relativeAge(job.updated_at || job.created_at)}</span>
                  )}
                  <StatusPill job={job} />
                  {job.status === 'recommended' && (
                    <Link
                      to={`/jobs/${job.id}`}
                      className="hidden h-8 items-center rounded-md bg-accent px-3 text-[12px] font-semibold text-white no-underline hover:bg-accent-hover sm:flex"
                    >
                      Review
                    </Link>
                  )}
                  <button
                    type="button"
                    aria-label="More"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-secondary hover:bg-overlay hover:text-primary"
                  >
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <AddJobModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}
