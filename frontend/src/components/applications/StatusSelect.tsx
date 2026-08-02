import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { APPLICATION_STATUSES, STATUS_META } from '../../lib/applications.ts'
import type { ApplicationStatus } from '../../lib/applications.ts'

type StatusSelectProps = {
  value: ApplicationStatus
  onChange: (next: ApplicationStatus) => void | Promise<void>
  isSaving?: boolean
  label?: string
}

/**
 * Colour-coded status picker. A native <select> can't carry the per-status
 * tint the design calls for, so this is a small custom popover.
 */
export default function StatusSelect({ value, onChange, isSaving = false, label }: StatusSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const meta = STATUS_META[value] ?? STATUS_META.applied

  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  const handleSelect = async (next: ApplicationStatus) => {
    setIsOpen(false)
    if (next === value) return
    await onChange(next)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={isSaving}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label ?? `Status: ${meta.label}`}
        className={`inline-flex h-7 w-[132px] items-center justify-between gap-1.5 rounded-md px-2.5 text-[12px] font-medium outline-none transition-opacity duration-[120ms] focus-visible:ring-2 focus-visible:ring-accent-muted disabled:opacity-60 ${meta.pillClass}`}
      >
        <span className="flex items-center gap-1.5 truncate">
          {isSaving ? <Loader2 size={11} className="animate-spin" /> : <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />}
          {meta.label}
        </span>
        <ChevronDown size={12} className="shrink-0 opacity-70" />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-1.5 w-[170px] overflow-hidden rounded-md border border-border-default bg-elevated py-1 shadow-xl animate-fade-in"
        >
          {APPLICATION_STATUSES.map((status) => {
            const option = STATUS_META[status]
            return (
              <button
                key={status}
                type="button"
                role="option"
                aria-selected={status === value}
                onClick={() => handleSelect(status)}
                className="flex h-8 w-full items-center justify-between px-3 text-left text-[13px] text-secondary transition-colors duration-[120ms] hover:bg-overlay hover:text-primary"
              >
                <span className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${option.dotClass}`} />
                  {option.label}
                </span>
                {status === value && <Check size={13} className="text-accent" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
