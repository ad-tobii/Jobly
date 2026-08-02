import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  ClipboardList,
  ExternalLink,
  NotebookPen,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import * as applicationsApi from '../api/applications.js'
import useToastStore from '../store/toastStore.js'
import Button from '../components/ui/Button.tsx'
import EmptyState from '../components/ui/EmptyState.tsx'
import Modal from '../components/ui/Modal.tsx'
import PageHeader from '../components/ui/PageHeader.tsx'
import Skeleton from '../components/ui/Skeleton.tsx'
import StatusSelect from '../components/applications/StatusSelect.tsx'
import {
  APPLICATION_STATUSES,
  STATUS_META,
  activeCount,
  countByStatus,
  formatAppliedDate,
} from '../lib/applications.ts'
import type { Application, ApplicationStatus } from '../lib/applications.ts'

type StatusFilter = 'all' | ApplicationStatus

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  ...APPLICATION_STATUSES.map((status) => ({ value: status, label: STATUS_META[status].label })),
]

function ApplicationsSkeleton() {
  return (
    <div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3.5 border-b border-border-faint px-4 py-4 last:border-b-0">
          <Skeleton width="w-9" height="h-9" />
          <div className="flex-1">
            <Skeleton width="w-1/3" height="h-3.5" />
            <Skeleton width="w-1/5" height="h-3" className="mt-2" />
          </div>
          <Skeleton width="w-[132px]" height="h-7" />
        </div>
      ))}
    </div>
  )
}

function CompanyLogo({ application }: { application: Application }) {
  const logo = application.jobs?.logo_url
  if (logo) {
    return <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-md border border-border-faint object-cover" />
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-faint bg-app text-secondary">
      <Building2 size={16} strokeWidth={1.5} />
    </div>
  )
}

// ── Notes editor ──────────────────────────────────────────────────────────────
function NotesModal({
  application,
  onClose,
  onSave,
}: {
  application: Application | null
  onClose: () => void
  onSave: (id: string, notes: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Reload the draft whenever a different application is opened.
  useEffect(() => {
    setDraft(application?.notes || '')
  }, [application])

  if (!application) return null

  const handleSave = async () => {
    setIsSaving(true)
    const ok = await onSave(application.id, draft)
    setIsSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Notes"
      size="large"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={isSaving}>
            {isSaving ? 'Saving…' : 'Save notes'}
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-secondary">
        {application.jobs?.title || 'Untitled role'}
        {application.jobs?.company ? ` · ${application.jobs.company}` : ''}
      </p>
      <textarea
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Recruiter name, interview dates, salary discussed, follow-up reminders…"
        className="mt-4 min-h-[200px] w-full resize-y rounded-md border border-border-default bg-app px-3 py-3 text-[13px] leading-relaxed text-primary outline-none transition-colors duration-[120ms] placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
      />
    </Modal>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ApplicationsPage() {
  const toastSuccess = useToastStore((s) => s.success)
  const toastError = useToastStore((s) => s.error)

  const [applications, setApplications] = useState<Application[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [notesFor, setNotesFor] = useState<Application | null>(null)

  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (quiet) setIsRefreshing(true)
      else setIsLoading(true)

      const response = await applicationsApi.listApplications()

      setIsLoading(false)
      setIsRefreshing(false)

      if (response.error || !Array.isArray(response.data)) {
        const message = response.error || 'Unable to load applications.'
        setError(message)
        if (!quiet) toastError(message)
        return
      }

      setError('')
      setApplications(response.data)
    },
    [toastError],
  )

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => countByStatus(applications), [applications])
  const inPlay = useMemo(() => activeCount(applications), [applications])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return applications.filter((application) => {
      if (filter !== 'all' && application.status !== filter) return false
      if (!query) return true
      const haystack = [application.jobs?.title, application.jobs?.company, application.jobs?.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [applications, filter, search])

  /** Patch one field of an application, rolling back the row if the API rejects it. */
  const patchApplication = useCallback(
    async (id: string, changes: { status?: ApplicationStatus; notes?: string }) => {
      const previous = applications
      setSavingId(id)
      setApplications((current) =>
        current.map((application) => (application.id === id ? { ...application, ...changes } : application)),
      )

      const response = await applicationsApi.updateStatus(id, changes.status as string, changes.notes)
      setSavingId(null)

      if (response.error) {
        setApplications(previous)
        toastError(response.error)
        return false
      }

      // Take the server's version so updated_at and any coercion are reflected.
      if (response.data) {
        setApplications((current) =>
          current.map((application) =>
            application.id === id ? { ...application, ...response.data } : application,
          ),
        )
      }
      return true
    },
    [applications, toastError],
  )

  const handleStatusChange = async (application: Application, status: ApplicationStatus) => {
    const ok = await patchApplication(application.id, { status })
    if (ok) toastSuccess(`Moved to ${STATUS_META[status].label}`)
  }

  const handleNotesSave = async (id: string, notes: string) => {
    const ok = await patchApplication(id, { notes })
    if (ok) toastSuccess('Notes saved')
    return ok
  }

  const hasFilters = filter !== 'all' || search.trim() !== ''

  return (
    <div className="min-h-screen bg-app text-primary">
      <PageHeader
        title="Applications"
        subtitle={
          isLoading
            ? 'Loading your applications…'
            : `${counts.total} application${counts.total === 1 ? '' : 's'} · ${inPlay} still in play`
        }
        actions={
          <Button
            variant="ghost"
            onClick={() => load({ quiet: true })}
            disabled={isRefreshing}
            aria-label="Refresh applications"
            title="Refresh"
            className="w-10 !px-0"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
          </Button>
        }
      />

      <main className="px-5 py-6 sm:px-7">
        {/* ── Pipeline summary ─────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {APPLICATION_STATUSES.map((status) => {
            const meta = STATUS_META[status]
            const isActive = filter === status
            return (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(isActive ? 'all' : status)}
                aria-pressed={isActive}
                className={`rounded-lg border bg-surface p-4 text-left transition-colors duration-[120ms] ${
                  isActive ? 'border-accent-muted bg-accent-subtle' : 'border-border-faint hover:border-border-default'
                }`}
              >
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-secondary">
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
                  {meta.label}
                </span>
                <p className="mt-2.5 text-[26px] font-semibold leading-none text-primary">{counts[status]}</p>
              </button>
            )
          })}
        </section>

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                aria-pressed={filter === option.value}
                className={`h-8 rounded-md px-3 text-[13px] font-medium transition-colors duration-[120ms] ${
                  filter === option.value
                    ? 'bg-accent-subtle text-accent'
                    : 'text-secondary hover:bg-overlay hover:text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="relative lg:w-[280px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search applications…"
              aria-label="Search applications"
              className="h-9 w-full rounded-md border border-border-default bg-surface pl-9 pr-9 text-[13px] text-primary outline-none transition-colors duration-[120ms] placeholder:text-tertiary focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-tertiary hover:text-primary"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* ── List ─────────────────────────────────────────────────────────── */}
        <section className="mt-4 overflow-hidden rounded-lg border border-border-faint bg-surface">
          {isLoading && <ApplicationsSkeleton />}

          {!isLoading && error && (
            <EmptyState
              Icon={ClipboardList}
              title="Couldn't load your applications"
              description={error}
              action={
                <Button variant="ghost" onClick={() => load()}>
                  <RefreshCw size={14} />
                  Try again
                </Button>
              }
            />
          )}

          {!isLoading &&
            !error &&
            visible.length === 0 &&
            (hasFilters ? (
              <EmptyState
                Icon={Search}
                title="Nothing matches these filters"
                description="Try a different status or clear the search."
                action={
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setFilter('all')
                      setSearch('')
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                Icon={ClipboardList}
                title="No applications yet"
                description="When you mark a job as applied, it lands here so you can track interviews, offers and rejections."
                action={
                  <Link
                    to="/jobs"
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-[13px] font-medium text-white no-underline transition-colors duration-[120ms] hover:bg-accent-hover"
                  >
                    Browse jobs
                  </Link>
                }
              />
            ))}

          {!isLoading &&
            !error &&
            visible.map((application) => (
              <div
                key={application.id}
                className="group flex flex-col gap-3 border-b border-border-faint px-4 py-3.5 transition-colors duration-[120ms] last:border-b-0 hover:bg-app/60 sm:flex-row sm:items-center sm:gap-4"
              >
                <Link
                  to={`/jobs/${application.job_id}`}
                  className="flex min-w-0 flex-1 items-center gap-3.5 rounded-md no-underline outline-none focus-visible:ring-2 focus-visible:ring-accent-muted"
                >
                  <CompanyLogo application={application} />
                  <div className="min-w-0">
                    <h3 className="truncate text-[14px] font-medium text-primary">
                      {application.jobs?.title || 'Untitled role'}
                    </h3>
                    <p className="mt-0.5 truncate text-[12px] text-secondary">
                      {application.jobs?.company || 'Unknown company'}
                      <span className="text-tertiary"> · Applied {formatAppliedDate(application.applied_at)}</span>
                    </p>
                  </div>
                </Link>

                <div className="flex shrink-0 items-center gap-2">
                  {typeof application.jobs?.match_score === 'number' && (
                    <span className="hidden h-7 items-center rounded-md bg-overlay px-2.5 text-[12px] font-medium text-secondary md:inline-flex">
                      {application.jobs.match_score}%
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setNotesFor(application)}
                    aria-label={application.notes ? 'Edit notes' : 'Add notes'}
                    title={application.notes ? 'Edit notes' : 'Add notes'}
                    className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-[120ms] hover:bg-overlay hover:text-primary ${
                      application.notes ? 'text-accent' : 'text-tertiary'
                    }`}
                  >
                    <NotebookPen size={15} />
                  </button>

                  <Link
                    to={`/jobs/${application.job_id}`}
                    aria-label="Open job"
                    title="Open job"
                    className="hidden h-8 w-8 items-center justify-center rounded-md text-tertiary no-underline transition-colors duration-[120ms] hover:bg-overlay hover:text-primary sm:flex"
                  >
                    <ExternalLink size={15} />
                  </Link>

                  <StatusSelect
                    value={application.status}
                    isSaving={savingId === application.id}
                    onChange={(status) => handleStatusChange(application, status)}
                    label={`Status for ${application.jobs?.title || 'application'}`}
                  />
                </div>
              </div>
            ))}
        </section>
      </main>

      <NotesModal application={notesFor} onClose={() => setNotesFor(null)} onSave={handleNotesSave} />
    </div>
  )
}
