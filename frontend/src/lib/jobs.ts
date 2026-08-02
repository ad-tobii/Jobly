// Shared job vocabulary + formatting used by Dashboard, Jobs and Job detail.

export type JobLike = {
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

/** Statuses where the backend pipeline is still working on the job. */
export const SCORING_STATUSES = ['scraping', 'scraped', 'scoring', 'generating']

/** Statuses that end an SSE stream — nothing more will arrive after these. */
export const TERMINAL_STATES = ['recommended', 'low_match', 'ready', 'failed', 'applied']

export const STATUS_LABELS: Record<string, string> = {
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

export function statusLabel(status: string) {
  return STATUS_LABELS[status] || status.replace(/_/g, ' ')
}

export function isScoring(job: Pick<JobLike, 'status'>) {
  return SCORING_STATUSES.includes(job.status)
}

/** Best available score: the job's own, else the highest CV match. */
export function bestScore(job: JobLike): number | null {
  if (typeof job.match_score === 'number') return job.match_score
  const fromMatches = job.job_cv_matches?.reduce((max, match) => Math.max(max, match.score || 0), 0)
  return fromMatches || null
}

export function scoreTone(score?: number | null) {
  if (score === null || score === undefined) return 'neutral' as const
  if (score >= 70) return 'success' as const
  if (score >= 50) return 'warning' as const
  return 'error' as const
}

export function formatJobTitle(job: JobLike) {
  if (job.title?.trim()) return job.title
  if (job.status === 'scraping') return 'Reading LinkedIn job…'
  return 'Untitled role'
}

export function formatCompanyLine(job: JobLike) {
  const company = job.company?.trim() || 'Unknown company'
  return job.location ? `${company} • ${job.location}` : company
}

export function relativeAge(value?: string | null) {
  if (!value) return ''
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(diffMs / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}
