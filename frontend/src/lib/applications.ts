// Application pipeline vocabulary. Mirrors VALID_STATUSES in
// backend/src/routes/applications.js — keep the two in sync.

export const APPLICATION_STATUSES = [
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'dismissed',
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export type Application = {
  id: string
  job_id: string
  status: ApplicationStatus
  notes?: string | null
  applied_at?: string | null
  updated_at?: string | null
  jobs?: {
    title?: string | null
    company?: string | null
    location?: string | null
    logo_url?: string | null
    match_score?: number | null
  } | null
}

type StatusMeta = {
  label: string
  /** Pill background + text colour. */
  pillClass: string
  /** Small leading dot colour. */
  dotClass: string
}

export const STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  applied: {
    label: 'Applied',
    pillClass: 'bg-overlay text-secondary',
    dotClass: 'bg-secondary',
  },
  interviewing: {
    label: 'Interviewing',
    pillClass: 'bg-info-subtle text-info',
    dotClass: 'bg-info',
  },
  offer: {
    label: 'Offer',
    pillClass: 'bg-success-subtle text-success',
    dotClass: 'bg-success',
  },
  rejected: {
    label: 'Rejected',
    pillClass: 'bg-error-subtle text-error',
    dotClass: 'bg-error',
  },
  dismissed: {
    label: 'Dismissed',
    pillClass: 'bg-overlay text-tertiary',
    dotClass: 'bg-tertiary',
  },
}

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value)
}

/** Counts per status, plus a total, for the summary strip. */
export function countByStatus(applications: Application[]) {
  const counts = Object.fromEntries(
    APPLICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<ApplicationStatus, number>

  for (const application of applications) {
    if (isApplicationStatus(application.status)) counts[application.status] += 1
  }

  return { ...counts, total: applications.length }
}

/**
 * Active = still in play. Rejected and dismissed applications are closed out,
 * so the "in play" figure ignores them.
 */
export function activeCount(applications: Application[]) {
  return applications.filter(
    (application) => application.status === 'applied' || application.status === 'interviewing',
  ).length
}

export function formatAppliedDate(value?: string | null) {
  if (!value) return 'Unknown date'
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
