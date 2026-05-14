import { X } from 'lucide-react'
import useDialogStore from '../../store/dialogStore.js'

export default function ConfirmDialog() {
  const dialog = useDialogStore((s) => s.dialog)
  const close  = useDialogStore((s) => s.close)

  if (!dialog) return null

  const handleConfirm = () => { dialog.onConfirm?.(); close() }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[4px] animate-fade-in"
      onClick={close}
    >
      <div
        className="w-full max-w-[480px] bg-surface border border-border-default rounded-lg animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-faint">
          <span id="confirm-title" className="text-[16px] font-semibold text-primary">
            {dialog.title}
          </span>
          <button
            onClick={close}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center rounded-md text-secondary hover:bg-overlay hover:text-primary transition-colors duration-[120ms]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        {dialog.body && (
          <div className="px-6 py-5">
            <p className="text-[14px] text-secondary leading-relaxed">{dialog.body}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border-faint">
          <button
            onClick={close}
            className="h-8 px-4 rounded-md text-[13px] font-medium text-secondary border border-border-default bg-transparent hover:bg-overlay transition-colors duration-[120ms]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className={`h-8 px-4 rounded-md text-[13px] font-medium text-white transition-colors duration-[120ms] ${
              dialog.destructive
                ? 'bg-error hover:brightness-90'
                : 'bg-accent hover:bg-accent-hover'
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
