import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as jobsApi from '../api/jobs.js'
import * as cvsApi from '../api/cvs.js'
import * as applicationsApi from '../api/applications.js'

/**
 * Data hooks for the app's list/detail screens.
 *
 * The api/* modules resolve to { data, error } rather than throwing, so each
 * queryFn re-throws the error string — that's what React Query needs to move a
 * query into its error state.
 *
 * Each hook is generic: the api layer is untyped JS, so the calling page
 * declares the shape it actually renders rather than casting after the fact.
 */

const unwrap = async <T,>(call: Promise<{ data: unknown; error: string | null }>): Promise<T> => {
  const { data, error } = await call
  if (error) throw new Error(error)
  return data as T
}

export const queryKeys = {
  dashboard: (timeline: string) => ['dashboard', timeline] as const,
  jobs: () => ['jobs'] as const,
  job: (id: string) => ['job', id] as const,
  cvs: () => ['cvs'] as const,
  applications: () => ['applications'] as const,
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function useDashboard<T>(timeline: string) {
  return useQuery({
    queryKey: queryKeys.dashboard(timeline),
    queryFn: () => unwrap<T>(jobsApi.getDashboard({ timeline })),
  })
}

export function useJobs<T>() {
  return useQuery({
    queryKey: queryKeys.jobs(),
    queryFn: () => unwrap<T[]>(jobsApi.listJobs()),
  })
}

export function useJob<T>(id?: string) {
  return useQuery({
    queryKey: queryKeys.job(id || ''),
    queryFn: () => unwrap<T>(jobsApi.getJob(id as string)),
    enabled: Boolean(id),
  })
}

export function useCVs<T>() {
  return useQuery({
    queryKey: queryKeys.cvs(),
    queryFn: () => unwrap<T[]>(cvsApi.listCVs()),
  })
}

export function useApplications<T>() {
  return useQuery({
    queryKey: queryKeys.applications(),
    queryFn: () => unwrap<T[]>(applicationsApi.listApplications()),
  })
}

// ── Writes ────────────────────────────────────────────────────────────────────

export function useDeleteJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unwrap<unknown>(jobsApi.deleteJob(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs() })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdateApplication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status?: string; notes?: string }) =>
      unwrap<unknown>(applicationsApi.updateStatus(id, status, notes)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.applications() })
    },
  })
}

/** Refresh everything a newly added job could affect. */
export function useInvalidateJobData() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.jobs() })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['job'] })
  }
}
