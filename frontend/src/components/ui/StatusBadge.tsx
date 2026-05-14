type BadgeProps = { status: string; label?: string; className?: string }

const CLASS_MAP: Record<string, string> = {
  scraping:          'bg-info-subtle   text-info',
  scoring:           'bg-info-subtle   text-info',
  processing:        'bg-info-subtle   text-info',
  generating:        'bg-info-subtle   text-info',
  ready:             'bg-success-subtle text-success',
  recommended:       'bg-success-subtle text-success',
  low_match:         'bg-warning-subtle text-warning',
  failed:            'bg-error-subtle   text-error',
  invalid:           'bg-error-subtle   text-error',
  unsalvageable:     'bg-error-subtle   text-error',
  needs_enhancement: 'bg-warning-subtle text-warning',
  applied:           'bg-overlay        text-secondary',
  interviewing:      'bg-info-subtle    text-info',
  offer:             'bg-success-subtle text-success',
  rejected:          'bg-error-subtle   text-error',
  dismissed:         'bg-overlay        text-secondary',
}

const LABELS: Record<string, string> = {
  scraping: 'Scraping', scoring: 'Scoring', processing: 'Processing',
  generating: 'Generating', ready: 'Ready', recommended: 'Recommended',
  low_match: 'Low Match', failed: 'Failed', invalid: 'Invalid',
  unsalvageable: 'Poor Quality', needs_enhancement: 'Needs Enhancement',
  applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer',
  rejected: 'Rejected', dismissed: 'Dismissed',
}

export default function StatusBadge({ status, label, className = '' }: BadgeProps) {
  const cls = CLASS_MAP[status] ?? 'bg-overlay text-secondary'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-medium ${cls} ${className}`}>
      {label ?? LABELS[status] ?? status}
    </span>
  )
}
