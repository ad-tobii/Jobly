import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, Check, ChevronDown, Filter, Plus, Send, Sparkles, Target } from 'lucide-react'
import useSSE from '../hooks/useSSE.js'
import { useDashboard, useDeleteJob } from '../hooks/queries.ts'
import useToastStore from '../store/toastStore.js'
import useDialogStore from '../store/dialogStore.js'
import Button from '../components/ui/Button.tsx'
import EmptyState from '../components/ui/EmptyState.tsx'
import PageHeader from '../components/ui/PageHeader.tsx'
import Skeleton from '../components/ui/Skeleton.tsx'
import AddJobModal from '../components/jobs/AddJobModal.tsx'
import JobRow from '../components/jobs/JobRow.tsx'
import { TERMINAL_STATES, formatJobTitle, isScoring } from '../lib/jobs.ts'
import type { JobLike } from '../lib/jobs.ts'

type Timeline = 'today' | 'weekly' | 'monthly' | 'all_time'
type TabKey = 'all' | 'scoring' | 'recommended' | 'ready' | 'applied'

type DashboardData = {
  timeline: Timeline
  stats: {
    total_jobs: number
    recommended: number
    ready: number
    applied: number
    scoring: number
  }
  jobs: JobLike[]
}

const TIMELINES: Array<{ value: Timeline; label: string; short: string }> = [
  { value: 'today', label: 'Today', short: 'today' },
  { value: 'weekly', label: 'This week', short: 'this week' },
  { value: 'monthly', label: 'This month', short: 'this month' },
  { value: 'all_time', label: 'All time', short: 'all time' },
]

const TABS: Array<{ value: TabKey; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'scoring', label: 'In progress' },
  { value: 'recommended', label: 'Recommended' },
  { value: 'ready', label: 'Ready' },
  { value: 'applied', label: 'Applied' },
]

const emptyData: DashboardData = {
  timeline: 'weekly',
  stats: { total_jobs: 0, recommended: 0, ready: 0, applied: 0, scoring: 0 },
  jobs: [],
}

function JobStreamListener({ jobId, onUpdate }: { jobId: string; onUpdate: () => void }) {
  const stream = useSSE(`/jobs/${jobId}/status-stream`, TERMINAL_STATES)

  useEffect(() => {
    if (!stream.data?.status) return
    onUpdate()
  }, [onUpdate, stream.data])

  return null
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  hint,
  Icon,
  isLoading,
  accent = false,
  to,
}: {
  label: string
  value: number
  hint?: string
  Icon: typeof Briefcase
  isLoading: boolean
  accent?: boolean
  to?: string
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span
          className={`text-[11px] font-semibold uppercase tracking-wide ${accent ? 'text-accent' : 'text-secondary'}`}
        >
          {label}
        </span>
        <Icon size={15} strokeWidth={1.5} className={accent ? 'text-accent' : 'text-tertiary'} />
      </div>
      <div className="mt-4 flex items-end gap-2.5">
        {isLoading ? (
          <Skeleton width="w-12" height="h-7" />
        ) : (
          <span className="text-[30px] font-semibold leading-none text-primary">{value}</span>
        )}
        {hint && !isLoading && <span className="mb-1 text-[12px] text-secondary">{hint}</span>}
      </div>
    </>
  )

  const className =
    'block rounded-lg border p-5 no-underline transition-colors duration-[120ms] ' +
    (accent ? 'border-accent-muted bg-accent-subtle' : 'border-border-faint bg-surface hover:border-border-default')

  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

function RowSkeleton() {
  return (
    <div>
      {Array.from({ length: 4 }).map((_, index) => (
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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const toastSuccess = useToastStore((s) => s.success)
  const toastError = useToastStore((s) => s.error)
  const confirm = useDialogStore((s) => s.confirm)

  const [timeline, setTimeline] = useState<Timeline>('weekly')
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)

  const selectedTimeline = TIMELINES.find((item) => item.value === timeline) || TIMELINES[1]

  const { data: dashboard, isPending, error, refetch } = useDashboard<DashboardData>(timeline)
  const deleteJob = useDeleteJob()

  const data: DashboardData = dashboard || emptyData
  const isLoading = isPending
  const errorMessage = error ? error.message : ''

  const quietRefresh = () => refetch()

  // Dismiss the timeline menu on any outside click.
  useEffect(() => {
    if (!isFilterOpen) return
    const close = () => setIsFilterOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [isFilterOpen])

  const visibleJobs = useMemo(
    () =>
      data.jobs.filter((job) => {
        if (activeTab === 'all') return true
        if (activeTab === 'scoring') return isScoring(job)
        return job.status === activeTab
      }),
    [activeTab, data.jobs],
  )

  const streamingJobs = useMemo(
    () => data.jobs.filter((job) => isScoring(job)).map((job) => job.id),
    [data.jobs],
  )

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

  const handleCreated = (jobId?: string) => {
    toastSuccess('Job added. Jobly is processing it now.')
    refetch()
    if (jobId) setActiveTab('scoring')
  }

  return (
    <div className="min-h-screen bg-app text-primary">
      {streamingJobs.map((jobId) => (
        <JobStreamListener key={jobId} jobId={jobId} onUpdate={quietRefresh} />
      ))}

      <PageHeader
        title="Dashboard"
        subtitle="Overview of your application pipeline."
        actions={
          <>
            <div className="relative" onClick={(event) => event.stopPropagation()}>
              <Button variant="ghost" onClick={() => setIsFilterOpen((value) => !value)} aria-expanded={isFilterOpen}>
                <Filter size={14} />
                {selectedTimeline.label}
                <ChevronDown size={14} className="opacity-70" />
              </Button>
              {isFilterOpen && (
                <div className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-md border border-border-default bg-elevated py-1 shadow-xl animate-fade-in">
                  {TIMELINES.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setTimeline(item.value)
                        setIsFilterOpen(false)
                      }}
                      className={`flex h-8 w-full items-center justify-between px-3 text-left text-[13px] transition-colors duration-[120ms] hover:bg-overlay ${
                        timeline === item.value ? 'text-accent' : 'text-secondary hover:text-primary'
                      }`}
                    >
                      {item.label}
                      {timeline === item.value && <Check size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={() => setIsAddOpen(true)}>
              <Plus size={15} />
              Add job
            </Button>
          </>
        }
      />

      <main className="px-5 py-6 sm:px-7">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total jobs"
            value={data.stats.total_jobs}
            hint={selectedTimeline.short}
            Icon={Briefcase}
            isLoading={isLoading}
            to="/jobs"
          />
          <StatCard
            label="Recommended"
            value={data.stats.recommended}
            hint="70%+ match"
            Icon={Target}
            isLoading={isLoading}
            accent
          />
          <StatCard label="Ready" value={data.stats.ready} hint="Action required" Icon={Sparkles} isLoading={isLoading} />
          <StatCard
            label="Applied"
            value={data.stats.applied}
            hint="Awaiting response"
            Icon={Send}
            isLoading={isLoading}
            to="/applications"
          />
        </section>

        <section className="mt-7">
          <div className="flex gap-1 overflow-x-auto border-b border-border-faint">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                aria-pressed={activeTab === tab.value}
                className={`h-10 shrink-0 border-b-2 px-3 text-[13px] font-medium transition-colors duration-[120ms] ${
                  activeTab === tab.value
                    ? 'border-accent text-primary'
                    : 'border-transparent text-secondary hover:text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-border-faint bg-surface">
            {isLoading && <RowSkeleton />}

            {!isLoading && errorMessage && (
              <EmptyState
                Icon={Briefcase}
                title="Couldn't load your dashboard"
                description={errorMessage}
                action={
                  <Button variant="ghost" onClick={() => refetch()}>
                    Try again
                  </Button>
                }
              />
            )}

            {!isLoading && !errorMessage && visibleJobs.length === 0 && (
              <EmptyState
                Icon={Briefcase}
                title={activeTab === 'all' ? 'No jobs yet' : 'Nothing in this view'}
                description={
                  activeTab === 'all'
                    ? 'Add a LinkedIn URL or paste a job description to start scoring.'
                    : 'Try another tab, or widen the timeline filter.'
                }
                action={
                  activeTab === 'all' ? (
                    <Button onClick={() => setIsAddOpen(true)}>
                      <Plus size={15} />
                      Add your first job
                    </Button>
                  ) : undefined
                }
              />
            )}

            {!isLoading &&
              !errorMessage &&
              visibleJobs.map((job) => <JobRow key={job.id} job={job} onDelete={handleDelete} />)}
          </div>

          {!isLoading && !errorMessage && data.jobs.length > 0 && (
            <div className="mt-4 flex justify-center">
              <Link
                to="/jobs"
                className="text-[13px] font-medium text-secondary no-underline transition-colors duration-[120ms] hover:text-primary"
              >
                View all jobs →
              </Link>
            </div>
          )}
        </section>
      </main>

      <AddJobModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onCreated={handleCreated} />
    </div>
  )
}
