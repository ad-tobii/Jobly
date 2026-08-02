// Ambient types for the plain-JS zustand stores and API modules.
// These give the .tsx call sites real inference so selectors don't need casts.
//
// Record shapes are deliberately loose here: this is the boundary with untyped
// JS, and each page declares the narrower view type it actually renders.

/** Every api/* module wraps axios and resolves to this shape — never throws. */
type ApiResult<T = any> = { data: T; error: null } | { data: null; error: string }

type Selector<S, R> = (state: S) => R

interface StoreHook<S> {
  <R>(selector: Selector<S, R>): R
  (): S
  getState(): S
}

// ── Store state ───────────────────────────────────────────────────────────────

interface JoblyUser {
  id: string
  email: string
  full_name?: string | null
  phone?: string | null
  linkedin_url?: string | null
  city?: string | null
  country?: string | null
  preferences?: Record<string, any> | null
  onboarding_complete?: boolean
  gmail_connected?: boolean
}

interface AuthState {
  user: JoblyUser | null
  token: string | null
  isAuthed: boolean
  isLoading: boolean
  login(email: string, password: string): Promise<{ error: string | null }>
  signup(email: string, password: string, full_name: string): Promise<{ error: string | null }>
  logout(): Promise<void>
  fetchMe(): Promise<void>
  updateProfile(profileData: Record<string, unknown>): Promise<{ error: string | null }>
  completeOnboarding(preferences: Record<string, unknown>): Promise<{ error: string | null }>
  _clear(): void
}

interface CVsState {
  cvs: any[]
  isLoading: boolean
  fetchCVs(): Promise<{ error: string | null }>
  addCV(cv: any): void
  updateCV(id: string, data: Record<string, unknown>): Promise<{ error: string | null }>
  deleteCV(id: string): Promise<{ error: string | null }>
}

interface JobsState {
  jobs: any[]
  activeJob: any | null
  isLoading: boolean
  fetchJobs(params?: Record<string, unknown>): Promise<{ error: string | null }>
  fetchJob(id: string): Promise<{ data: any; error: string | null }>
  addJob(job: any): void
  updateJob(id: string, updates: Record<string, unknown>): void
  deleteJob(id: string): Promise<{ error: string | null }>
}

interface ApplicationsState {
  applications: any[]
  isLoading: boolean
  fetchApplications(params?: Record<string, unknown>): Promise<{ error: string | null }>
  updateApplicationStatus(id: string, status: string, notes?: string): Promise<{ error: string | null }>
}

interface ToastState {
  toasts: Array<{ id: number; type: 'success' | 'error' | 'info'; message: string }>
  success(message: string): number
  error(message: string): number
  info(message: string): number
  dismiss(id: number): void
}

interface ConfirmOptions {
  title: string
  body?: string
  onConfirm?: () => void | Promise<void>
  destructive?: boolean
}

interface DialogState {
  dialog: ConfirmOptions | null
  confirm(options: ConfirmOptions): void
  close(): void
}

declare module '*authStore.js' {
  const useAuthStore: StoreHook<AuthState>
  export default useAuthStore
}

declare module '*cvsStore.js' {
  const useCVsStore: StoreHook<CVsState>
  export default useCVsStore
}

declare module '*jobsStore.js' {
  const useJobsStore: StoreHook<JobsState>
  export default useJobsStore
}

declare module '*applicationsStore.js' {
  const useApplicationsStore: StoreHook<ApplicationsState>
  export default useApplicationsStore
}

declare module '*toastStore.js' {
  const useToastStore: StoreHook<ToastState>
  export default useToastStore
}

declare module '*dialogStore.js' {
  const useDialogStore: StoreHook<DialogState>
  export default useDialogStore
}

// ── API modules ───────────────────────────────────────────────────────────────

declare module '*api/cvs.js' {
  export function uploadPDF(file: File, label: string): Promise<ApiResult>
  export function submitText(label: string, raw_text: string): Promise<ApiResult>
  export function listCVs(): Promise<ApiResult>
  export function updateCV(id: string, data: Record<string, unknown>): Promise<ApiResult>
  export function deleteCV(id: string): Promise<ApiResult>
  export function getQuestions(id: string): Promise<ApiResult>
  export function applyEnhancement(id: string, questions: unknown[], answers: unknown[]): Promise<ApiResult>
  export function skipEnhancement(id: string): Promise<ApiResult>
}

declare module '*api/jobs.js' {
  export function submitUrl(url: string): Promise<ApiResult<{ job_id?: string }>>
  export function submitPaste(raw_text: string): Promise<ApiResult<{ job_id?: string }>>
  export function selectCV(jobId: string, cv_id: string): Promise<ApiResult>
  export function listJobs(params?: Record<string, unknown>): Promise<ApiResult>
  export function getDashboard(params?: Record<string, unknown>): Promise<ApiResult>
  export function getJob(id: string): Promise<ApiResult>
  export function deleteJob(id: string): Promise<ApiResult>
  export function triggerDocs(jobId: string): Promise<ApiResult>
}

declare module '*api/applications.js' {
  export function markApplied(jobId: string): Promise<ApiResult>
  export function updateStatus(id: string, status?: string, notes?: string): Promise<ApiResult>
  export function listApplications(params?: Record<string, unknown>): Promise<ApiResult>
}

declare module '*api/documents.js' {
  export function getDocuments(jobId: string): Promise<ApiResult>
}

declare module '*api/auth.js' {
  export function signup(email: string, password: string, full_name: string): Promise<ApiResult>
  export function login(email: string, password: string): Promise<ApiResult>
  export function logout(): Promise<ApiResult>
  export function getMe(): Promise<ApiResult>
  export function updateProfile(data: Record<string, unknown>): Promise<ApiResult>
  export function getGmailConnectUrl(token?: string | null): string
  export function completeOnboarding(preferences: Record<string, unknown>): Promise<ApiResult>
}

interface SSEResult {
  status: string | null
  data: Record<string, any> | null
  error: string | null
  isConnected: boolean
}

declare module '*hooks/useSSE.js' {
  export function useSSE(url: string, terminalStates?: string[]): SSEResult
  export default useSSE
}
