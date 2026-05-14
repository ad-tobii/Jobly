type ScoreBarProps = {
  score: number | null
  showLabel?: boolean
  className?: string
}

function barColor(score: number) {
  if (score >= 70) return 'bg-success'
  if (score >= 50) return 'bg-warning'
  return 'bg-error'
}

function labelColor(score: number) {
  if (score >= 70) return 'text-success'
  if (score >= 50) return 'text-warning'
  return 'text-error'
}

export default function ScoreBar({ score, showLabel = true, className = '' }: ScoreBarProps) {
  if (score === null || score === undefined) return null
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-1 bg-overlay rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-400 ${barColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      {showLabel && (
        <span className={`text-[12px] font-medium shrink-0 w-7 text-right ${labelColor(score)}`}>
          {score}%
        </span>
      )}
    </div>
  )
}
