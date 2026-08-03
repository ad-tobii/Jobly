import { useEffect, useMemo, useState } from 'react'
import { Briefcase, Plus, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react'
import useSSE from '../hooks/useSSE.js'
import { useDeleteJob, useJobs } from '../hooks/queries.ts'
import useToastStore from '../store/toastStore.js'
import useDialogStore from '../store/dialogStore.js'
import Button from '../components/ui/Button.tsx'
import EmptyState from '../components/ui/EmptyState.tsx'
import PageHeader from '../components/ui/PageHeader.tsx'
import Skeleton from '../components/ui/Skeleton.tsx'
import AddJobModal from '../components/jobs/AddJobModal.tsx'
import JobRow from '../components/jobs/JobRow.tsx'
import { TERMINAL_STATES, bestScore, formatJobTitle, isScoring } from '../lib/jobs.ts'
import type { JobLike } from '../lib/jobs.ts'

type StatusFilter = 'all' | 'scoring' | 'recommended' | 'ready' | 'applied' | 'low_match' | 'failed'
type SortKey = 'newest' | 'oldest' | 'score'

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'scoring', label: 'In progress' },
  { value: 'recommended', label: 'Recommended' },
  { value: 'ready', label: 'Ready' },
  { value: 'applied', label: 'Applied' },
  { value: 'low_match', label: 'Low match' },
  { value: 'failed', label: 'Failed' },
]

const SCORE_FILTERS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Any score' },
  { value: 50, label: '50%+' },
  { value: 70, label: '70%+' },
  { value: 85, label: '85%+' },
]

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'score', label: 'Highest score' },
]

const selectClass =
  'h-9 rounded-md border border-border-default bg-surface px-2.5 text-[13px] text-primary outline-none ' +
  'transition-colors duration-[120ms] hover:bg-overlay focus:border-border-strong focus:ring-2 focus:ring-accent-muted/45'

/** Mounts one SSE subscription per in-flight job and refreshes the list on updates. */
function JobStreamListener({ jobId, onUpdate }: { jobId: string; onUpdate: () => void }) {
  const stream = useSSE(`/jobs/${jobId}/status-stream`, TERMINAL_STATES)

  useEffect(() => {
    if (!stream.data?.status) return
    onUpdate()
  }, [onUpdate, stream.data])

  return null
}

function JobListSkeleton() {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3.5 border-b border-border-faint px-4 py-3.5 last:border-b-0">
          <Skeleton width="w-9" height="h-9" />
          <div className="flex-1">
            <Skeleton width="w-2/5" height="h-3.5" />
            <Skeleton width="w-1/4" height="h-3" className="mt-2" />
          </div>
          <Skeleton width="w-[110px]" height="h-7" />
        </div>
      ))}
    </div>
  )
}

export default function JobsPage() {
  const toastSuccess = useToastStore((s) => s.success)
  const toastError = useToastStore((s) => s.error)
  const confirm = useDialogStore((s) => s.confirm)

  const { data, isPending, isFetching, error, refetch } = useJobs<JobLike>()
  const deleteJob = useDeleteJob()

  const jobs: JobLike[] = useMemo(() => data ?? [], [data])
  const isLoading = isPending
  const isRefreshing = isFetching && !isPending
  const errorMessage = error ? error.message : ''

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [minScore, setMinScore] = useState(0)
  const [sort, setSort] = useState<SortKey>('newest')

  const quietRefresh = () => refetch()

  const streamingJobIds = useMemo(
    () => jobs.filter((job) => isScoring(job)).map((job) => job.id),
    [jobs],
  )

  // Filtering and sorting happen client-side: the list is per-user and small,
  // so the controls stay instant instead of round-tripping on every keystroke.
  const visibleJobs = useMemo(() => {
    const query = search.trim().toLowerCase()

    const filtered = jobs.filter((job) => {
      if (status === 'scoring' ? !isScoring(job) : status !== 'all' && job.status !== status) return false

      if (minScore > 0) {
        const score = bestScore(job)
        if (score === null || score < minScore) return false
      }

      if (query) {
        const haystack = [job.title, job.company, job.location].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(query)) return false
      }

      return true
    })

    return filtered.sort((a, b) => {
      if (sort === 'score') return (bestScore(b) ?? -1) - (bestScore(a) ?? -1)
      const aTime = new Date(a.created_at).getTime()
      const bTime = new Date(b.created_at).getTime()
      return sort === 'oldest' ? aTime - bTime : bTime - aTime
    })
  }, [jobs, minScore, search, sort, status])

  const hasActiveFilters = search.trim() !== '' || status !== 'all' || minScore > 0

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setMinScore(0)
  }

  const handleDelete = (job: JobLike) => {
    confirm({
      title: 'Delete this job?',
      body: `"${formatJobTitle(job)}" and its generated documents will be removed. This cannot be undone.`,
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteJob.mutateAsync(job.id)
          toastSuccess('Job deleted')
        } catch (err) {
          toastError(err instanceof Error ? err.message : 'Could not delete this job.')
        }
      },
    })
  }

  const handleCreated = () => {
    toastSuccess('Job added. Jobly is processing it now.')
    refetch()
    setStatus('all')
  }

  return (
    <div className="min-h-screen bg-app text-primary">
      {streamingJobIds.map((jobId) => (
        <JobStreamListener key={jobId} jobId={jobId} onUpdate={quietRefresh} />
      ))}

      <PageHeader
        title="Jobs"
        subtitle={
          isLoading
            ? 'Loading your pipeline…'
            : `${jobs.length} job${jobs.length === 1 ? '' : 's'} tracked${
                hasActiveFilters ? ` · ${visibleJobs.length} shown` : ''
              }`
        }
        actions={
          <>
            <Button
              variant="ghost"
              onClick={quietRefresh}
              disabled={isRefreshing}
              aria-label="Refresh jobs"
              title="Refresh"
              className="w-10 !px-0"
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            </Button>
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus size={15} />
              Add job
            </Button>
          </>
        }
      />

      <main className="px-5 py-6 sm:px-7">
        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title, company or location…"
              aria-label="Search jobs"
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

          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal size={15} className="hidden text-tertiary lg:block" />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              aria-label="Filter by status"
              className={selectClass}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={minScore}
              onChange={(event) => setMinScore(Number(event.target.value))}
              aria-label="Filter by minimum score"
              className={selectClass}
            >
              {SCORE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label="Sort jobs"
              className={selectClass}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X size={13} />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* ── List ────────────────────────────────────────────────────────── */}
        <section className="mt-5 overflow-hidden rounded-lg border border-border-faint bg-surface">
          {isLoading && <JobListSkeleton />}

          {!isLoading && errorMessage && (
            <EmptyState
              Icon={Briefcase}
              title="Couldn't load your jobs"
              description={errorMessage}
              action={
                <Button variant="ghost" onClick={() => refetch()}>
                  <RefreshCw size={14} />
                  Try again
                </Button>
              }
            />
          )}

          {!isLoading &&
            !errorMessage &&
            visibleJobs.length === 0 &&
            (hasActiveFilters ? (
              <EmptyState
                Icon={Search}
                title="No jobs match these filters"
                description="Try widening the score range or clearing the search."
                action={
                  <Button variant="ghost" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                Icon={Briefcase}
                title="No jobs yet"
                description="Add a LinkedIn URL or paste a job description. Jobly scores it against your CVs and drafts tailored documents."
                action={
                  <Button onClick={() => setIsAddOpen(true)}>
                    <Plus size={15} />
                    Add your first job
                  </Button>
                }
              />
            ))}

          {!isLoading &&
            !errorMessage &&
            visibleJobs.map((job) => <JobRow key={job.id} job={job} onDelete={handleDelete} />)}
        </section>
      </main>

      <AddJobModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onCreated={handleCreated} />
    </div>
  )
}
