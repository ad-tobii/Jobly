import { X, CheckCircle, XCircle, Info } from 'lucide-react'
import useToastStore from '../../store/toastStore.js'

type ToastType = 'success' | 'error' | 'info'

const ICON_MAP: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={15} className="text-success shrink-0" />,
  error:   <XCircle    size={15} className="text-error   shrink-0" />,
  info:    <Info       size={15} className="text-info    shrink-0" />,
}

export default function ToastRenderer() {
  const toasts  = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t: any) => (
        <div
          key={t.id}
          role="alert"
          className="pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-[380px] bg-elevated border border-border-default rounded-lg px-4 py-3 text-[13px] text-primary animate-slide-right"
        >
          {ICON_MAP[t.type as ToastType]}
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="text-tertiary hover:text-secondary transition-colors duration-[120ms] shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
