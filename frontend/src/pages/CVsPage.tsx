import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Check,
  FileText,
  Lightbulb,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import * as cvsApi from '../api/cvs.js'
import useSSE from '../hooks/useSSE.js'
import useCVsStore from '../store/cvsStore.js'
import useDialogStore from '../store/dialogStore.js'
import useToastStore from '../store/toastStore.js'

type CV = {
  id: string
  label: string
  source_type: 'file' | 'text'
  status: string
  quality_tier?: string | null
  quality_summary?: string | null
  rejection_reason?: string | null
  cv_health_score?: number | null
  cv_health_feedback?: CVFeedback | string | null
  is_active?: boolean | null
  created_at: string
}

type CVFeedback = {
  score?: number
  summary?: string
  strengths?: string[]
  weaknesses?: string[]
  suggestions?: string[]
}

type Question = {
  id: string
  question: string
  context?: string
}

const TERMINAL_STATES = ['ready', 'failed', 'invalid', 'unsalvageable', 'needs_enhancement']
const LIVE_STATES = ['processing', 'enhancing']

function relativeAge(value?: string | null) {
  if (!value) return 'Recently'
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(diffMs / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function scoreTone(score?: number | null) {
  if (score === null || score === undefined) return 'bg-tertiary text-tertiary'
  if (score >= 80) return 'bg-success text-success'
  if (score >= 60) return 'bg-accent text-accent'
  return 'bg-warning text-warning'
}

function stringifyFeedback(value: unknown) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const feedback = value as CVFeedback
    return feedback.summary || ''
  }
  return String(value)
}

function cvSummary(cv: CV) {
  return stringifyFeedback(cv.cv_health_feedback) || cv.quality_summary || cv.rejection_reason || 'No feedback available yet.'
}

function cvFeedbackObject(cv: CV): CVFeedback | null {
  return cv.cv_health_feedback && typeof cv.cv_health_feedback === 'object'
    ? cv.cv_health_feedback
    : null
}

function FeedbackList({
  title,
  items,
  tone,
}: {
  title: string
  items?: string[]
  tone: 'strength' | 'weakness' | 'suggestion'
}) {
  if (!items?.length) return null
  const Icon = tone === 'strength' ? Check : tone === 'weakness' ? XCircle : ArrowRight
  const iconClass = tone === 'strength' ? 'text-success' : tone === 'weakness' ? 'text-error' : 'text-info'

  return (
    <div className="mt-8">
      <h3 className="text-[14px] font-semibold text-primary">{title}</h3>
      <ul className="mt-3 grid gap-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-[13px] leading-relaxed text-secondary">
            <Icon size={14} className={`mt-0.5 shrink-0 ${iconClass}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function sourceLabel(sourceType?: string | null) {
  return sourceType === 'file' ? 'PDF' : 'Text'
}

function CVStreamListener({ cvId, onUpdate }: { cvId: string; onUpdate: () => void }) {
  const stream = useSSE(`/cv/${cvId}/status-stream`, TERMINAL_STATES)

  useEffect(() => {
    if (!stream.data?.status) return
    onUpdate()
  }, [onUpdate, stream.data])

  return null
}

function FeedbackModal({ cv, onClose }: { cv: CV | null; onClose: () => void }) {
  if (!cv) return null
  const feedback = cvFeedbackObject(cv)
  const score = cv.cv_health_score ?? feedback?.score ?? 0
  const tone = scoreTone(score)

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-[5px] animate-fade-in">
      <button
        type="button"
        aria-label="Close feedback"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[430px] flex-col border-l border-border-faint bg-surface shadow-2xl animate-slide-right">
        <div className="flex h-14 items-center justify-between border-b border-border-faint px-5">
          <h2 className="truncate text-[16px] font-semibold text-primary">{cv.label} Feedback</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-secondary hover:bg-overlay hover:text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div>
            <div className="flex items-center justify-between text-[14px]">
              <span className="font-semibold text-primary">Overall Score</span>
              <span className="font-bold text-primary">{score}/100</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-overlay">
              <div className={`h-full rounded-full ${tone.split(' ')[0]}`} style={{ width: `${Math.min(score, 100)}%` }} />
            </div>
          </div>

          <section className="mt-8">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary">Summary</h3>
            <p className="mt-3 text-[13px] leading-relaxed text-secondary">{cvSummary(cv)}</p>
          </section>

          <FeedbackList title="Strengths" items={feedback?.strengths} tone="strength" />
          <FeedbackList title="Weaknesses" items={feedback?.weaknesses} tone="weakness" />
          <FeedbackList title="Suggestions" items={feedback?.suggestions} tone="suggestion" />
        </div>
      </aside>
    </div>
  )
}

function UploadModal({
  isOpen,
  onClose,
  onUploaded,
}: {
  isOpen: boolean
  onClose: () => void
  onUploaded: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const toastError = useToastStore((s) => s.error)
  const [label, setLabel] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setLabel('')
      setFile(null)
      setError('')
      setIsUploading(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleFile = (nextFile?: File) => {
    if (!nextFile) return
    if (nextFile.type !== 'application/pdf') {
      setError('Only PDF files are supported.')
      return
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setError('PDF must be 10MB or smaller.')
      return
    }
    setFile(nextFile)
    setError('')
    if (!label.trim()) setLabel(nextFile.name.replace(/\.pdf$/i, ''))
  }

  const canSubmit = label.trim().length > 0 && !!file && !isUploading

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || !file) return

    setIsUploading(true)
    setError('')
    const response = await cvsApi.uploadPDF(file, label.trim())
    setIsUploading(false)

    if (response.error) {
      setError(response.error)
      toastError(response.error)
      return
    }

    onUploaded()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="w-full max-w-[510px] rounded-lg border border-border-default bg-surface p-5 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-primary">Upload New CV</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-secondary hover:bg-overlay hover:text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mt-5 flex flex-col gap-1.5">
          <span className="text-[12px] text-secondary">CV Name</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Automation CV"
            className="h-10 rounded-md border border-border-default bg-app px-3 text-[13px] text-primary outline-none placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
          />
        </label>

        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => event.key === 'Enter' && fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            handleFile(event.dataTransfer.files[0])
          }}
          className="mt-5 flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border-strong bg-app px-6 text-center hover:border-accent-muted"
        >
          <Upload size={24} className="text-secondary" />
          <p className="mt-3 text-[13px] text-secondary">
            {file ? file.name : <>Drop your CV here or <span className="text-accent">click to browse</span></>}
          </p>
          <p className="mt-1 text-[11px] text-tertiary">PDF only · Max 10MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event: ChangeEvent<HTMLInputElement>) => handleFile(event.target.files?.[0])}
          />
        </div>

        {error && <p className="mt-4 text-[13px] text-error">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isUploading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          {isUploading ? 'Uploading...' : 'Upload CV'}
        </button>
      </form>
    </div>
  )
}

function EnhancementModal({
  cv,
  onClose,
  onApplied,
}: {
  cv: CV | null
  onClose: () => void
  onApplied: () => void
}) {
  const toastError = useToastStore((s) => s.error)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadQuestions = async () => {
      if (!cv) return
      setIsLoading(true)
      setError('')
      const response = await cvsApi.getQuestions(cv.id)
      setIsLoading(false)

      if (cancelled) return

      if (response.error || !Array.isArray(response.data?.questions)) {
        const message = response.error || 'Failed to generate enhancement questions.'
        setError(message)
        toastError(message)
        return
      }

      setQuestions(response.data.questions)
      setAnswers(Object.fromEntries(response.data.questions.map((question: Question) => [question.id, ''])))
    }

    loadQuestions()

    return () => {
      cancelled = true
    }
  }, [cv, toastError])

  if (!cv) return null

  const handleApply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsApplying(true)
    setError('')

    const payload = questions.map((question) => ({
      id: question.id,
      answer: answers[question.id]?.trim() || '',
    }))
    const response = await cvsApi.applyEnhancement(cv.id, questions, payload)
    setIsApplying(false)

    if (response.error) {
      setError(response.error)
      toastError(response.error)
      return
    }

    onApplied()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <form onSubmit={handleApply} className="max-h-[86vh] w-full max-w-[620px] overflow-y-auto rounded-lg border border-border-default bg-surface p-5 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-primary">Enhance with AI</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-secondary hover:bg-overlay hover:text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mt-2 text-[13px] text-secondary">Answer a few targeted questions so Jobly can strengthen {cv.label}.</p>

        {isLoading && (
          <div className="mt-6 flex h-28 items-center justify-center gap-2 text-secondary">
            <Loader2 size={17} className="animate-spin text-accent" />
            Preparing questions...
          </div>
        )}

        {!isLoading && questions.length > 0 && (
          <div className="mt-6 grid gap-5">
            {questions.map((question) => (
              <label key={question.id} className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-primary">{question.question}</span>
                {question.context && <span className="text-[12px] italic text-tertiary">{question.context}</span>}
                <textarea
                  value={answers[question.id] || ''}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                  placeholder="Add specific numbers, outcomes, tools, or scope..."
                  className="min-h-[86px] resize-none rounded-md border border-border-default bg-app px-3 py-3 text-[13px] leading-relaxed text-primary outline-none placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
                />
              </label>
            ))}
          </div>
        )}

        {error && <p className="mt-5 text-[13px] text-error">{error}</p>}

        <button
          type="submit"
          disabled={isLoading || isApplying || questions.length === 0}
          className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isApplying ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {isApplying ? 'Enhancing...' : 'Apply Enhancement'}
        </button>
      </form>
    </div>
  )
}

function CVCard({
  cv,
  onFeedback,
  onDelete,
  onEnhance,
  onSkip,
}: {
  cv: CV
  onFeedback: (cv: CV) => void
  onDelete: (cv: CV) => void
  onEnhance: (cv: CV) => void
  onSkip: (cv: CV) => void
}) {
  const tone = scoreTone(cv.cv_health_score)
  const needsEnhancement = cv.status === 'needs_enhancement'
  const isLive = LIVE_STATES.includes(cv.status)

  return (
    <article
      className={`rounded-lg border bg-surface px-6 py-5 ${
        needsEnhancement ? 'border-accent-muted' : 'border-border-faint'
      }`}
    >
      <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <FileText size={17} className={needsEnhancement ? 'mt-1 text-info' : 'mt-1 text-accent'} />
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-semibold text-primary">{cv.label}</h2>
              <p className="mt-0.5 text-[12px] text-secondary">
                Uploaded {relativeAge(cv.created_at)} · {sourceLabel(cv.source_type)}
              </p>
            </div>
          </div>

          {needsEnhancement && (
            <p className="ml-8 mt-1 flex items-center gap-1.5 text-[12px] font-medium text-info">
              <Lightbulb size={13} />
              Enhancement available
            </p>
          )}
        </div>

        <div className="w-full sm:w-[142px]">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-secondary">Health Score</span>
            <span className={`font-bold ${tone.replace('bg-', 'text-').split(' ')[1] || 'text-secondary'}`}>
              {isLive ? '...' : `${cv.cv_health_score ?? 0}/100`}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-overlay">
            <div
              className={`h-full rounded-full ${tone.split(' ')[0]}`}
              style={{ width: `${isLive ? 45 : Math.min(cv.cv_health_score ?? 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {isLive ? (
        <div className="mt-5 flex items-center gap-2 rounded-md bg-app px-4 py-3 text-[13px] text-secondary">
          <Loader2 size={15} className="animate-spin text-accent" />
          Processing this CV...
        </div>
      ) : needsEnhancement ? (
        <div className="mt-5 rounded-md bg-overlay px-4 py-3">
          <p className="text-[13px] leading-relaxed text-secondary">"{cvSummary(cv)}"</p>
        </div>
      ) : (
        <p className="mt-5 text-[13px] italic leading-relaxed text-secondary">"{cvSummary(cv)}"</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {needsEnhancement ? (
          <>
            <button
              type="button"
              onClick={() => onEnhance(cv)}
              className="flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-hover"
            >
              <Sparkles size={14} />
              Enhance with AI
            </button>
            <button
              type="button"
              onClick={() => onSkip(cv)}
              className="h-9 rounded-md border border-border-default px-4 text-[13px] font-medium text-secondary hover:bg-overlay hover:text-primary"
            >
              Proceed anyway
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onFeedback(cv)}
            disabled={isLive}
            className="h-9 rounded-md border border-border-default px-4 text-[13px] font-medium text-secondary hover:bg-overlay hover:text-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            View Feedback
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(cv)}
          className="ml-auto h-9 rounded-md px-2 text-[13px] font-medium text-error hover:bg-error-subtle"
        >
          Delete
        </button>
      </div>
    </article>
  )
}

export default function CVsPage() {
  const cvs = useCVsStore((s) => s.cvs) as CV[]
  const isLoading = useCVsStore((s) => s.isLoading)
  const fetchCVs = useCVsStore((s) => s.fetchCVs)
  const deleteCV = useCVsStore((s) => s.deleteCV)
  const confirm = useDialogStore((s) => s.confirm)
  const toastSuccess = useToastStore((s) => s.success)
  const toastError = useToastStore((s) => s.error)
  const [feedbackCv, setFeedbackCv] = useState<CV | null>(null)
  const [enhancementCv, setEnhancementCv] = useState<CV | null>(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [pageError, setPageError] = useState('')

  const loadCVs = useCallback(async () => {
    const result = await fetchCVs()
    if (result.error) {
      setPageError(result.error)
      toastError(result.error)
    } else {
      setPageError('')
    }
  }, [fetchCVs, toastError])

  useEffect(() => {
    loadCVs()
  }, [loadCVs])

  const liveCvs = useMemo(() => cvs.filter((cv) => LIVE_STATES.includes(cv.status)), [cvs])

  const handleDelete = (cv: CV) => {
    confirm({
      title: 'Delete CV?',
      body: `${cv.label} will be removed from Jobly. Existing generated documents may no longer have this CV available for future matching.`,
      destructive: true,
      onConfirm: async () => {
        const result = await deleteCV(cv.id)
        if (result.error) {
          toastError(result.error)
        } else {
          toastSuccess('CV deleted')
        }
      },
    })
  }

  const handleSkip = async (cv: CV) => {
    const response = await cvsApi.skipEnhancement(cv.id)
    if (response.error) {
      toastError(response.error)
      return
    }
    toastSuccess('CV queued for processing')
    loadCVs()
  }

  return (
    <div className="min-h-screen bg-app text-primary">
      {liveCvs.map((cv) => (
        <CVStreamListener key={cv.id} cvId={cv.id} onUpdate={loadCVs} />
      ))}

      <header className="flex h-14 items-center justify-between border-b border-border-faint px-7">
        <h1 className="text-[20px] font-semibold text-primary">My CVs</h1>
        <button
          type="button"
          onClick={() => setIsUploadOpen(true)}
          className="flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-hover"
        >
          <Plus size={15} />
          Upload New CV
        </button>
      </header>

      <main className="w-full max-w-[940px] px-7 py-6">
        {isLoading && (
          <div className="flex h-44 items-center justify-center gap-2 rounded-lg border border-border-faint bg-surface text-secondary">
            <Loader2 size={18} className="animate-spin text-accent" />
            Loading CVs...
          </div>
        )}

        {!isLoading && pageError && (
          <div className="flex items-center gap-3 rounded-lg border border-error/60 bg-error-subtle px-5 py-4 text-[13px] text-error">
            <AlertCircle size={16} />
            {pageError}
          </div>
        )}

        {!isLoading && !pageError && cvs.length === 0 && (
          <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-border-faint bg-surface px-5 text-center">
            <FileText size={28} className="text-tertiary" />
            <p className="mt-4 text-[15px] font-semibold text-primary">No CVs yet</p>
            <p className="mt-1 text-[13px] text-secondary">Upload a PDF CV to start matching against jobs.</p>
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="mt-5 flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-hover"
            >
              <Plus size={15} />
              Upload New CV
            </button>
          </div>
        )}

        {!isLoading && !pageError && cvs.length > 0 && (
          <div className="grid gap-4">
            {cvs.map((cv) => (
              <CVCard
                key={cv.id}
                cv={cv}
                onFeedback={setFeedbackCv}
                onDelete={handleDelete}
                onEnhance={setEnhancementCv}
                onSkip={handleSkip}
              />
            ))}
          </div>
        )}
      </main>

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={() => {
          toastSuccess('CV uploaded. Jobly is processing it now.')
          loadCVs()
        }}
      />
      <FeedbackModal cv={feedbackCv} onClose={() => setFeedbackCv(null)} />
      <EnhancementModal
        cv={enhancementCv}
        onClose={() => setEnhancementCv(null)}
        onApplied={() => {
          toastSuccess('Enhancement applied. Jobly is processing it now.')
          loadCVs()
        }}
      />
    </div>
  )
}
