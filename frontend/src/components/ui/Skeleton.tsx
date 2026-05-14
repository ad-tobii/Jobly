type SkeletonProps = {
  width?: string
  height?: string
  className?: string
}

export default function Skeleton({ width = 'w-full', height = 'h-4', className = '' }: SkeletonProps) {
  return (
    <span
      className={`block relative overflow-hidden bg-overlay rounded-md ${width} ${height} ${className}`}
    >
      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent animate-shimmer" />
    </span>
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-surface border border-border-faint rounded-lg p-4 flex flex-col gap-2.5">
      <Skeleton width="w-2/5" height="h-3.5" />
      <Skeleton width="w-3/5" height="h-3" />
      <Skeleton width="w-1/2" height="h-3" />
    </div>
  )
}
