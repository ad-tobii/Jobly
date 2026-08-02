import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Footer area — usually the submit/cancel buttons. */
  footer?: ReactNode
  size?: 'standard' | 'large'
}

/**
 * Modal shell per DESIGN.md: blurred backdrop, bordered surface panel,
 * closes on Escape and backdrop click.
 */
export default function Modal({ isOpen, onClose, title, children, footer, size = 'standard' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    // Stop the page behind the modal from scrolling while it's open.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus into the panel so keyboard users land in the dialog.
    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[4px] animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={
          'flex max-h-[calc(100vh-32px)] w-full flex-col rounded-lg border border-border-default ' +
          'bg-surface outline-none animate-slide-up ' +
          (size === 'large' ? 'max-w-[560px]' : 'max-w-[480px]')
        }
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border-faint px-6 py-4">
          <h2 className="text-[16px] font-semibold text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors duration-[120ms] hover:bg-overlay hover:text-primary"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border-faint px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  )
}
