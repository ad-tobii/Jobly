type StoreSelector = (state: any) => any

declare module '*authStore.js' {
  const useAuthStore: {
    (selector: StoreSelector): any
    getState(): any
  }
  export default useAuthStore
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

declare module '*api/auth.js' {
  export function getGmailConnectUrl(token?: string | null): string
  export function completeOnboarding(preferences: any): Promise<any>
}

declare module '*hooks/useSSE.js' {
  export function useSSE(url: string, terminalStates?: string[]): any
  export default useSSE
}
