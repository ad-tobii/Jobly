import { useState } from 'react'
import type { FormEvent } from 'react'
import { ClipboardCheck, Link2, Plus } from 'lucide-react'
import * as jobsApi from '../../api/jobs.js'
import useToastStore from '../../store/toastStore.js'
import Button from '../ui/Button.tsx'
import Modal from '../ui/Modal.tsx'

type AddMode = 'url' | 'paste'

const MIN_PASTE_LENGTH = 100

const inputClass =
  'w-full rounded-md border border-border-default bg-app px-3 text-[13px] text-primary outline-none ' +
  'transition-colors duration-[120ms] placeholder:text-tertiary ' +
  'focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45'

export default function AddJobModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onCreated: (jobId?: string) => void
}) {
  const toastError = useToastStore((s) => s.error)
  const [mode, setMode] = useState<AddMode>('url')
  const [url, setUrl] = useState('')
  const [rawText, setRawText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const trimmedText = rawText.trim()
  const canSubmit =
    mode === 'url' ? url.trim().length > 0 && !isSubmitting : trimmedText.length >= MIN_PASTE_LENGTH && !isSubmitting

  const reset = () => {
    setUrl('')
    setRawText('')
    setError('')
  }

  const handleClose = () => {
    if (isSubmitting) return
    reset()
    onClose()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setError('')
    setIsSubmitting(true)

    const response =
      mode === 'url' ? await jobsApi.submitUrl(url.trim()) : await jobsApi.submitPaste(trimmedText)

    setIsSubmitting(false)

    if (response.error) {
      const message = response.error || 'Unable to add this job.'
      setError(message)
      toastError(message)
      return
    }

    reset()
    onCreated(response.data?.job_id)
    onClose()
  }

  const switchMode = (next: AddMode) => {
    setMode(next)
    setError('')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add a job"
      size="large"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="add-job-form" disabled={!canSubmit} isLoading={isSubmitting}>
            {!isSubmitting && <Plus size={15} />}
            {isSubmitting ? 'Adding…' : 'Add job'}
          </Button>
        </>
      }
    >
      <form id="add-job-form" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-0.5 rounded-md border border-border-default bg-app p-0.5">
          {(
            [
              { value: 'url' as const, label: 'LinkedIn URL', Icon: Link2 },
              { value: 'paste' as const, label: 'Paste job', Icon: ClipboardCheck },
            ]
          ).map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => switchMode(value)}
              aria-pressed={mode === value}
              className={`flex h-9 items-center justify-center gap-2 rounded-[4px] text-[13px] font-medium transition-colors duration-[120ms] ${
                mode === value ? 'bg-surface text-primary' : 'text-secondary hover:text-primary'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {mode === 'url' ? (
          <label className="mt-5 flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-secondary">LinkedIn job URL</span>
            <input
              autoFocus
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://linkedin.com/jobs/view/…"
              className={`h-10 ${inputClass}`}
            />
            <span className="text-[11px] text-tertiary">
              Jobly scrapes the posting, scores it against your CVs, then drafts tailored documents.
            </span>
          </label>
        ) : (
          <label className="mt-5 flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-secondary">Job description</span>
            <textarea
              autoFocus
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="Paste the full job description here…"
              className={`min-h-[160px] resize-y py-3 leading-relaxed ${inputClass}`}
            />
            <span className={`text-[11px] ${trimmedText.length >= MIN_PASTE_LENGTH ? 'text-tertiary' : 'text-secondary'}`}>
              {trimmedText.length} / {MIN_PASTE_LENGTH} characters minimum
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-error-subtle px-3 py-2 text-[13px] text-error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
