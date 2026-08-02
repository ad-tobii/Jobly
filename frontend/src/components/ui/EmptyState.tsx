import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type EmptyStateProps = {
  Icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export default function EmptyState({ Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}>
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-faint bg-app">
        <Icon size={20} className="text-tertiary" strokeWidth={1.5} />
      </div>
      <p className="mt-4 text-[14px] font-medium text-primary">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-[380px] text-[13px] leading-relaxed text-secondary">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
