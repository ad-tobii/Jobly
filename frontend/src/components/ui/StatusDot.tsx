type StatusDotProps = { status: string; className?: string }

function variant(status: string) {
  if (['scraping','scoring','generating','processing'].includes(status)) return 'processing'
  if (['ready','recommended'].includes(status)) return 'ready'
  if (['failed','invalid','unsalvageable'].includes(status)) return 'failed'
  if (['low_match','needs_enhancement'].includes(status)) return 'warning'
  return ''
}

const CLASS: Record<string, string> = {
  processing: 'bg-info   animate-pulse-dot',
  ready:      'bg-success',
  failed:     'bg-error',
  warning:    'bg-warning',
}

export default function StatusDot({ status, className = '' }: StatusDotProps) {
  const v = variant(status)
  if (!v) return null
  return (
    <span
      title={status}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${CLASS[v]} ${className}`}
    />
  )
}
