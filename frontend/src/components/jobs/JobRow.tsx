import { Link } from 'react-router-dom'
import { Briefcase, Check, ExternalLink, FileText, Sparkles, Trash2 } from 'lucide-react'
import {
  bestScore,
  formatCompanyLine,
  formatJobTitle,
  isScoring,
  relativeAge,
  scoreTone,
  statusLabel,
} from '../../lib/jobs.ts'
import type { JobLike } from '../../lib/jobs.ts'

const TONE_CLASS = {
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  error: 'bg-error-subtle text-error',
  neutral: 'bg-overlay text-secondary',
} as const

function JobLogo({ job }: { job: JobLike }) {
  if (job.logo_url) {
    return (
      <img
        src={job.logo_url}
        alt=""
        className="h-9 w-9 shrink-0 rounded-md border border-border-faint object-cover"
      />
    )
  }

  const Icon = job.status === 'applied' ? Check : job.status === 'ready' ? FileText : Briefcase
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-faint bg-app text-secondary">
      <Icon size={16} strokeWidth={1.5} />
    </div>
  )
}

/** Right-hand status cell — a live progress bar while working, a pill once settled. */
function StatusCell({ job }: { job: JobLike }) {
  const score = bestScore(job)

  if (isScoring(job)) {
    return (
      <div className="w-full sm:w-[150px]">
        <div className="flex items-center justify-between text-[11px] font-medium text-info">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-info animate-pulse-dot" />
            {job.status === 'generating' ? 'Generating docs' : 'Scoring'}
          </span>
          {score ? <span>{score}%</span> : null}
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-overlay">
          <div className="h-full w-2/5 rounded-full bg-info animate-pulse-dot" />
        </div>
      </div>
    )
  }

  if (job.status === 'recommended' || job.status === 'low_match') {
    const tone = scoreTone(score)
    return (
      <span
        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium ${TONE_CLASS[tone]}`}
      >
        {job.status === 'recommended' && <Sparkles size={12} />}
        {score !== null ? `${score}% match` : statusLabel(job.status)}
      </span>
    )
  }

  const cls =
    job.status === 'ready'
      ? 'bg-warning-subtle text-warning'
      : job.status === 'applied'
        ? 'bg-success-subtle text-success'
        : job.status === 'failed'
          ? 'bg-error-subtle text-error'
          : 'bg-overlay text-secondary'

  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium ${cls}`}>
      {job.status === 'applied' && <Check size={12} />}
      {statusLabel(job.status)}
    </span>
  )
}

export default function JobRow({ job, onDelete }: { job: JobLike; onDelete?: (job: JobLike) => void }) {
  return (
    // Below `sm` the row stacks: a 150px status cell alongside the title would
    // squeeze it down to a few characters on a phone.
    <div className="group flex flex-col gap-2.5 border-b border-border-faint px-4 py-3 transition-colors duration-[120ms] last:border-b-0 hover:bg-app/60 sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
      <Link
        to={`/jobs/${job.id}`}
        className="flex min-w-0 items-center gap-3.5 rounded-md no-underline outline-none focus-visible:ring-2 focus-visible:ring-accent-muted"
      >
        <JobLogo job={job} />
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-medium text-primary">{formatJobTitle(job)}</h3>
          <p className="mt-0.5 truncate text-[12px] text-secondary">
            {formatCompanyLine(job)}
            <span className="text-tertiary"> · {relativeAge(job.created_at)}</span>
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-3 pl-[50px] sm:pl-0">
        <StatusCell job={job} />

        {/* Row actions reveal on hover for pointer users, but stay visible on
            touch screens where there is no hover state to trigger them. */}
        {job.source_url && (
          <a
            href={job.source_url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open original posting"
            title="Open original posting"
            className="flex h-8 w-8 items-center justify-center rounded-md text-tertiary transition-all duration-[120ms] hover:bg-overlay hover:text-primary focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <ExternalLink size={15} />
          </a>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(job)}
            aria-label={`Delete ${formatJobTitle(job)}`}
            title="Delete job"
            className="flex h-8 w-8 items-center justify-center rounded-md text-tertiary transition-all duration-[120ms] hover:bg-overlay hover:text-error focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
