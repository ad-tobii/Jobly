import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  subtitle?: string
  /** Right-aligned action buttons. */
  actions?: ReactNode
  /** Rendered above the title — used for back links. */
  leading?: ReactNode
}

/**
 * Standard page header per DESIGN.md: title block left, actions right,
 * border-bottom divider, 24px horizontal padding.
 */
export default function PageHeader({ title, subtitle, actions, leading }: PageHeaderProps) {
  return (
    <header className="border-b border-border-faint px-5 py-5 sm:px-7">
      {leading && <div className="mb-4">{leading}</div>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-semibold leading-tight text-primary sm:text-[24px]">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-[13px] text-secondary">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </header>
  )
}
