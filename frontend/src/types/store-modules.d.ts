type StoreSelector = (state: any) => any

declare module '*authStore.js' {
  const useAuthStore: {
    (selector: StoreSelector): any
    getState(): any
  }
  export default useAuthStore
}

declare module '*cvsStore.js' {
  const useCVsStore: {
    (selector: StoreSelector): any
    getState(): any
  }
  export default useCVsStore
}

declare module '*toastStore.js' {
  const useToastStore: {
    (selector: StoreSelector): any
    getState(): any
  }
  export default useToastStore
}

declare module '*dialogStore.js' {
  const useDialogStore: {
    (selector: StoreSelector): any
    getState(): any
  }
  export default useDialogStore
}

declare module '*api/cvs.js' {
  export function uploadPDF(file: File, label: string): Promise<any>
  export function submitText(label: string, raw_text: string): Promise<any>
  export function listCVs(): Promise<any>
  export function updateCV(id: string, data: any): Promise<any>
  export function deleteCV(id: string): Promise<any>
  export function getQuestions(id: string): Promise<any>
  export function applyEnhancement(id: string, questions: any[], answers: any[]): Promise<any>
  export function skipEnhancement(id: string): Promise<any>
}

declare module '*api/jobs.js' {
  export function submitUrl(url: string): Promise<any>
  export function submitPaste(raw_text: string): Promise<any>
  export function selectCV(jobId: string, cv_id: string): Promise<any>
  export function listJobs(params?: any): Promise<any>
  export function getDashboard(params?: any): Promise<any>
  export function getJob(id: string): Promise<any>
  export function deleteJob(id: string): Promise<any>
  export function triggerDocs(jobId: string): Promise<any>
}

declare module '*api/applications.js' {
  export function markApplied(jobId: string): Promise<any>
  export function updateStatus(id: string, status: string, notes?: string): Promise<any>
  export function listApplications(params?: any): Promise<any>
}

declare module '*api/auth.js' {
  export function getGmailConnectUrl(token?: string | null): string
  export function completeOnboarding(preferences: any): Promise<any>
}

declare module '*hooks/useSSE.js' {
  export function useSSE(url: string, terminalStates?: string[]): any
  export default useSSE
}
