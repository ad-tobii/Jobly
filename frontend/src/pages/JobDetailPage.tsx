import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react'
import * as applicationsApi from '../api/applications.js'
import * as cvsApi from '../api/cvs.js'
import * as jobsApi from '../api/jobs.js'
import useSSE from '../hooks/useSSE.js'
import useToastStore from '../store/toastStore.js'
import Skeleton from '../components/ui/Skeleton.tsx'

type CV = {
  id: string
  label: string
  source_type: string
  created_at: string
}

type Match = {
  cv_id: string
  score: number
  reasoning?: {
    strengths?: string[]
    weaknesses?: string[]
  } | null
  gaps?: string[]
  summary?: string | null
  recommended?: boolean
  cv?: CV
}

type DocumentSet = {
  id?: string
  tailored_cv_url?: string | null
  cover_letter_url?: string | null
  generated_at?: string | null
}

type RenderDescription = {
  about_role?: string[]
  responsibilities?: string[]
  experience_requirements?: string[]
}

type Job = {
  id: string
  title?: string | null
  company?: string | null
  location?: string | null
  description?: string | null
  render_description?: RenderDescription | null
  source_url?: string | null
  source_type?: string | null
  status: string
  match_score?: number | null
  selected_cv_id?: string | null
  created_at: string
  job_cv_matches?: Match[]
  documents?: DocumentSet[]
}

const TERMINAL_STATES = ['recommended', 'low_match', 'ready', 'failed', 'applied']
const LIVE_STATES = ['scraping', 'scraped', 'scoring', 'generating']

function arrayFrom(value?: string[] | null) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function relativeAge(value?: string | null) {
  if (!value) return 'recently'
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(diffMs / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function splitDescription(description?: string | null, rendered?: RenderDescription | null) {
  if (rendered) {
    const about = arrayFrom(rendered.about_role)
    const responsibilities = arrayFrom(rendered.responsibilities)
    const requirements = arrayFrom(rendered.experience_requirements)
    if (about.length || responsibilities.length || requirements.length) {
      return { about, responsibilities, requirements }
    }
  }

  const text = description?.trim()
  if (!text) {
    return {
      about: ['No job description is available yet. If this job was added from LinkedIn, Jobly may still be scraping it.'],
      responsibilities: [],
      requirements: [],
    }
  }

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const responsibilities: string[] = []
  const requirements: string[] = []
  const about: string[] = []
  let bucket: 'about' | 'responsibilities' | 'requirements' = 'about'

  for (const line of lines) {
    const normalized = line.toLowerCase()
    if (/responsibilit|what you'll do|duties/.test(normalized)) {
      bucket = 'responsibilities'
      continue
    }
    if (/requirement|qualification|skills|experience/.test(normalized)) {
      bucket = 'requirements'
      continue
    }

    const cleaned = line.replace(/^[-*]\s*/, '')
    if (bucket === 'responsibilities') responsibilities.push(cleaned)
    else if (bucket === 'requirements') requirements.push(cleaned)
    else about.push(cleaned)
  }

  return {
    about: about.length ? about.slice(0, 4) : lines.slice(0, 3),
    responsibilities: responsibilities.slice(0, 6),
    requirements: requirements.slice(0, 6),
  }
}

function scoreTone(score?: number | null) {
  if ((score ?? 0) >= 70) return { text: 'text-success', bg: 'bg-success' }
  if ((score ?? 0) >= 50) return { text: 'text-warning', bg: 'bg-warning' }
  return { text: 'text-error', bg: 'bg-error' }
}

const STATUS_LABELS: Record<string, string> = {
  scraping: 'Scraping',
  scraped: 'Scraped',
  scoring: 'Scoring',
  generating: 'Generating',
  recommended: 'Recommended',
  ready: 'Ready',
  applied: 'Applied',
  low_match: 'Low match',
  failed: 'Failed',
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] || status.replace(/_/g, ' ')
}

function DocumentLink({ href, label }: { href?: string | null; label: string }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex h-10 items-center justify-between rounded-md border border-border-default bg-app px-3 text-[12px] text-primary no-underline hover:border-accent-muted"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Download size={13} className="shrink-0 text-secondary" />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-[11px] text-tertiary">Open</span>
    </a>
  )
}

function MatchList({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: 'strength' | 'gap' | 'suggestion'
}) {
  if (!items.length) return null
  const Icon = tone === 'strength' ? Check : tone === 'gap' ? XCircle : ArrowRight
  const iconClass = tone === 'strength' ? 'text-success' : tone === 'gap' ? 'text-warning' : 'text-info'

  return (
    <section className="mt-8">
      <h3 className="text-[14px] font-semibold text-primary">{title}</h3>
      <ul className="mt-3 grid gap-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-[13px] leading-relaxed text-secondary">
            <Icon size={14} className={`mt-0.5 shrink-0 ${iconClass}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function MatchDrawer({ match, onClose }: { match: Match | null; onClose: () => void }) {
  if (!match) return null
  const score = match.score || 0
  const tone = scoreTone(score)

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-[5px] animate-fade-in">
      <button type="button" aria-label="Close match analysis" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[430px] flex-col border-l border-border-faint bg-surface animate-slide-right">
        <div className="flex h-14 items-center justify-between border-b border-border-faint px-5">
          <h2 className="truncate text-[16px] font-semibold text-primary">{match.cv?.label || 'CV'} Match</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md text-secondary hover:bg-overlay hover:text-primary">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div>
            <div className="flex items-center justify-between text-[14px]">
              <span className="font-semibold text-primary">Overall Match</span>
              <span className="font-bold text-primary">{score}/100</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-overlay">
              <div className={`h-full rounded-full ${tone.bg}`} style={{ width: `${Math.min(score, 100)}%` }} />
            </div>
          </div>

          <section className="mt-8">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary">Summary</h3>
            <p className="mt-3 text-[13px] leading-relaxed text-secondary">
              {match.summary || 'No written summary was returned for this CV match.'}
            </p>
          </section>

          <MatchList title="Strengths" items={arrayFrom(match.reasoning?.strengths)} tone="strength" />
          <MatchList title="Weaknesses" items={arrayFrom(match.reasoning?.weaknesses)} tone="gap" />
          <MatchList title="Gaps" items={arrayFrom(match.gaps)} tone="suggestion" />
        </div>
      </aside>
    </div>
  )
}

function LowMatchWarning({
  match,
  onCancel,
  onConfirm,
}: {
  match: Match | null
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!match) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[4px] animate-fade-in">
      <div className="w-full max-w-[480px] rounded-lg border border-border-default bg-surface">
        <div className="flex items-center justify-between border-b border-border-faint px-6 py-4">
          <h2 className="text-[16px] font-semibold text-primary">Low Match Warning</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-md text-secondary hover:bg-overlay hover:text-primary">
            <X size={15} />
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-[14px] leading-relaxed text-secondary">
            This CV is a {match.score}% match for this job. You can still tailor documents manually, but the result may need heavier review before you apply.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border-faint px-6 py-4">
          <button type="button" onClick={onCancel} className="h-9 rounded-md border border-border-default px-4 text-[13px] font-medium text-secondary hover:bg-overlay hover:text-primary">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="h-9 rounded-md bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-hover">
            Tailor Anyway
          </button>
        </div>
      </div>
    </div>
  )
}

export default function JobDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toastSuccess = useToastStore((s) => s.success)
  const toastError = useToastStore((s) => s.error)
  const [job, setJob] = useState<Job | null>(null)
  const [cvs, setCvs] = useState<CV[]>([])
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null)
  const [drawerMatch, setDrawerMatch] = useState<Match | null>(null)
  const [warningMatch, setWarningMatch] = useState<Match | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isTailoring, setIsTailoring] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState('')

  const stream = useSSE(job && LIVE_STATES.includes(job.status) ? `/jobs/${job.id}/status-stream` : '', TERMINAL_STATES)

  const loadDetail = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    const [jobResponse, cvsResponse] = await Promise.all([
      jobsApi.getJob(id),
      cvsApi.listCVs(),
    ])
    setIsLoading(false)

    if (jobResponse.error || !jobResponse.data) {
      const message = jobResponse.error || 'Unable to load job.'
      setError(message)
      toastError(message)
      return
    }

    if (cvsResponse.error) toastError(cvsResponse.error)

    const nextJob = jobResponse.data
    setJob(nextJob)
    setCvs(Array.isArray(cvsResponse.data) ? cvsResponse.data : [])
    setSelectedCvId((current) =>
      current ||
      nextJob.selected_cv_id ||
      nextJob.job_cv_matches?.find((match: Match) => match.recommended)?.cv_id ||
      nextJob.job_cv_matches?.[0]?.cv_id ||
      null
    )
    setError('')
  }, [id, toastError])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  useEffect(() => {
    if (!stream.data?.status) return
    loadDetail()
  }, [loadDetail, stream.data])

  const matches = useMemo(() => {
    const cvMap = new Map(cvs.map((cv) => [cv.id, cv]))
    return (job?.job_cv_matches || [])
      .map((match) => ({ ...match, cv: cvMap.get(match.cv_id) }))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
  }, [cvs, job])

  const selectedMatch = matches.find((match) => match.cv_id === selectedCvId) || matches[0]
  const documents = Array.isArray(job?.documents) ? job?.documents?.[0] : undefined
  const description = splitDescription(job?.description, job?.render_description)
  const topScore = selectedMatch?.score ?? job?.match_score ?? 0
  const tone = scoreTone(topScore)
  const hasSelectedServerCv = Boolean(job?.selected_cv_id)
  const isGenerating = job?.status === 'generating'
  const isApplied = job?.status === 'applied'

  const startTailoring = async () => {
    if (!job || !selectedCvId) return
    setIsTailoring(true)
    const response = await jobsApi.selectCV(job.id, selectedCvId)
    setIsTailoring(false)

    if (response.error) {
      toastError(response.error)
      return
    }

    toastSuccess('Tailoring started')
    loadDetail()
  }

  const handleTailor = () => {
    if ((selectedMatch?.score ?? 0) < 70) {
      setWarningMatch(selectedMatch || null)
      return
    }
    startTailoring()
  }

  const handleMarkApplied = async () => {
    if (!job) return
    setIsApplying(true)
    const response = await applicationsApi.markApplied(job.id)
    setIsApplying(false)

    if (response.error) {
      toastError(response.error)
      return
    }

    toastSuccess('Marked as applied')
    loadDetail()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-app">
        <header className="border-b border-border-faint px-5 py-5 sm:px-7">
          <Skeleton width="w-16" height="h-4" />
          <div className="mt-5 flex items-start gap-4">
            <Skeleton width="w-10" height="h-10" />
            <div className="flex-1">
              <Skeleton width="w-2/5" height="h-6" />
              <Skeleton width="w-1/3" height="h-3.5" className="mt-2.5" />
            </div>
          </div>
        </header>
        <div className="grid gap-8 px-5 py-7 sm:px-7 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-lg border border-border-faint bg-surface p-6">
            <Skeleton width="w-1/3" height="h-5" />
            <div className="mt-5 grid gap-2.5">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} width={index % 3 === 2 ? 'w-3/4' : 'w-full'} height="h-3.5" />
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border-faint bg-surface p-6">
            <Skeleton width="w-1/2" height="h-5" />
            <div className="mt-5 grid gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} width="w-full" height="h-[72px]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-app p-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[13px] text-secondary hover:text-primary">
          <ArrowLeft size={14} />
          Back
        </button>
        <div className="mt-8 rounded-lg border border-error/50 bg-error-subtle p-5 text-error">{error || 'Job not found'}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-app text-primary">
      <header className="border-b border-border-faint bg-app px-5 py-5 sm:px-7">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[13px] text-secondary hover:text-primary">
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-lg border border-border-default bg-surface text-primary">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-[24px] font-semibold text-primary">{job.title || 'Untitled role'}</h1>
                {!!topScore && (
                  <span className={`rounded-sm px-2.5 py-1 text-[11px] font-medium ${topScore >= 70 ? 'bg-success-subtle text-success' : topScore >= 50 ? 'bg-warning-subtle text-warning' : 'bg-error-subtle text-error'}`}>
                    {topScore}% Match
                  </span>
                )}
                <span className="rounded-sm bg-overlay px-2.5 py-1 text-[11px] font-medium text-secondary">{statusLabel(job.status)}</span>
              </div>
              <p className="mt-1 text-[13px] text-secondary">
                {[
                  job.company || 'Unknown company',
                  job.location,
                  `Added ${relativeAge(job.created_at)}`,
                  job.source_type ? `via ${job.source_type === 'url' ? 'LinkedIn' : 'paste'}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {job.source_url && (
              <a href={job.source_url} target="_blank" rel="noreferrer" className="flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-[13px] font-medium text-white no-underline hover:bg-accent-hover">
                Apply on LinkedIn
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="grid gap-6 px-5 py-6 sm:px-7 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-lg border border-border-faint bg-surface p-5 sm:p-7">
          <h2 className="border-b border-border-default pb-3 text-[18px] font-semibold text-primary">About the Role</h2>
          <div className="mt-5 grid gap-4 text-[14px] leading-relaxed text-secondary">
            {description.about.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>

          {!!description.responsibilities.length && (
            <section className="mt-8">
              <h3 className="text-[15px] font-semibold text-primary">Responsibilities</h3>
              <ul className="mt-4 grid gap-3 text-[14px] text-secondary">
                {description.responsibilities.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-tertiary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!!description.requirements.length && (
            <section className="mt-8">
              <h3 className="text-[15px] font-semibold text-primary">Experience Requirements</h3>
              <ul className="mt-4 grid gap-3 text-[14px] text-secondary">
                {description.requirements.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-tertiary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        <aside className="rounded-lg border border-border-faint bg-surface p-6">
          <div className="flex items-center justify-between border-b border-border-default pb-4">
            <h2 className="flex items-center gap-2 text-[16px] font-semibold text-primary">
              <Sparkles size={15} className="text-success" />
              Match Analysis
            </h2>
            <span className={`text-[22px] font-semibold ${tone.text}`}>{topScore}%</span>
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary">Select Profile To Compare</p>
            <div className="mt-4 grid gap-3">
              {matches.map((match) => {
                const selected = selectedCvId === match.cv_id
                return (
                  <button
                    key={match.cv_id}
                    type="button"
                    onClick={() => setSelectedCvId(match.cv_id)}
                    className={`flex min-h-[72px] items-center justify-between rounded-md border px-4 text-left transition-colors ${
                      selected ? 'border-accent bg-accent-subtle ring-1 ring-accent-muted' : 'border-border-default bg-transparent hover:border-accent-muted hover:bg-overlay/40'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <FileText size={18} className="shrink-0 text-accent" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-primary">{match.cv?.label || 'CV'}</span>
                        <span className="mt-0.5 block text-[11px] text-secondary">
                          {match.recommended ? 'Recommended' : `${match.score}% match`}
                        </span>
                      </span>
                    </span>
                    {match.recommended && <span className="rounded-sm bg-accent px-2 py-1 text-[10px] font-medium text-white">Recommended</span>}
                  </button>
                )
              })}

              {!matches.length && (
                <div className="rounded-md border border-border-default px-4 py-5 text-[13px] text-secondary">
                  No CV match scores are available yet.
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleTailor}
              disabled={!selectedCvId || isTailoring || isGenerating}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-accent-muted bg-transparent text-[13px] font-medium text-accent hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isTailoring || isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {isGenerating ? 'Tailoring documents...' : 'Tailor with Selected CV'}
            </button>

            <button
              type="button"
              onClick={() => selectedMatch && setDrawerMatch(selectedMatch)}
              disabled={!selectedMatch}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border-default bg-transparent text-[13px] font-medium text-secondary hover:border-accent-muted hover:bg-overlay hover:text-primary disabled:cursor-not-allowed disabled:opacity-45"
            >
              View Strengths & Gaps
            </button>
          </div>

          <section className="mt-7 border-y border-border-default py-6">
            <h3 className="text-[12px] font-bold uppercase text-secondary">Generated Documents</h3>
            {(isTailoring || isGenerating) && (
              <div className="mt-4 rounded-md border border-accent-muted bg-accent-subtle px-4 py-4">
                <div className="flex items-center gap-3 text-[13px] font-semibold text-primary">
                  <Loader2 size={16} className="animate-spin text-accent" />
                  Preparing tailored documents...
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-overlay">
                  <div className="h-full w-2/3 rounded-full bg-accent" />
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-secondary">
                  Jobly is using the selected CV to create a tailored CV and cover letter. This can take a little while.
                </p>
              </div>
            )}
            {!hasSelectedServerCv && !isTailoring && !isGenerating && (
              <p className="mt-3 text-[13px] leading-relaxed text-secondary">
                Select a CV and start tailoring to generate documents.
              </p>
            )}
            {hasSelectedServerCv && !isTailoring && !isGenerating && documents && (
              <div className="mt-3 grid gap-2">
                <DocumentLink href={documents.tailored_cv_url} label="Tailored CV" />
                <DocumentLink href={documents.cover_letter_url} label="Cover Letter" />
              </div>
            )}
            {hasSelectedServerCv && !isTailoring && !isGenerating && !documents && (
              <p className="mt-3 text-[13px] text-secondary">Documents are not available yet.</p>
            )}
          </section>

          <button
            type="button"
            onClick={handleMarkApplied}
            disabled={isApplying || isApplied}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-success px-4 text-[14px] font-medium text-white hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isApplying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {isApplied ? 'Marked as Applied' : 'Mark as Applied'}
          </button>
        </aside>
      </main>

      <MatchDrawer match={drawerMatch} onClose={() => setDrawerMatch(null)} />
      <LowMatchWarning
        match={warningMatch}
        onCancel={() => setWarningMatch(null)}
        onConfirm={() => {
          setWarningMatch(null)
          startTailoring()
        }}
      />
    </div>
  )
}
