import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import useAuthStore from './store/authStore.js'

// Route-level code splitting — each screen is its own chunk, so the initial
// load doesn't carry the CV enhancement flow or the job detail page.
const LoginPage = lazy(() => import('./pages/LoginPage.tsx'))
const SignupPage = lazy(() => import('./pages/SignupPage.tsx'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage.tsx'))
const DashboardPage = lazy(() => import('./pages/DashboardPage.tsx'))
const JobsPage = lazy(() => import('./pages/JobsPage.tsx'))
const JobDetailPage = lazy(() => import('./pages/JobDetailPage.tsx'))
const CVsPage = lazy(() => import('./pages/CVsPage.tsx'))
const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage.tsx'))

// Global UI — small and needed on every route, so not lazy.
import ToastRenderer from './components/ui/ToastRenderer.tsx'
import ConfirmDialog from './components/ui/ConfirmDialog.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import AppShell from './components/layout/AppShell.tsx'
import Skeleton from './components/ui/Skeleton.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Job data changes via background workers, so a short stale window keeps
      // things fresh without hammering the API on every navigation.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// ── Route fallback ────────────────────────────────────────────────────────────
function RouteFallback() {
  return (
    <div className="min-h-screen bg-app px-5 py-6 sm:px-7">
      <Skeleton width="w-40" height="h-7" />
      <Skeleton width="w-64" height="h-4" className="mt-3" />
      <div className="mt-8 grid gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} width="w-full" height="h-16" />
        ))}
      </div>
    </div>
  )
}

// ── Auth guards ───────────────────────────────────────────────────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthed = useAuthStore((s) => s.isAuthed)
  if (!isAuthed) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (user && user.onboarding_complete === false) {
    return <Navigate to="/onboarding" replace />
  }
  return <>{children}</>
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe)

  // Rehydrate user on hard refresh
  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />

              {/* Onboarding — authed but not yet complete */}
              <Route
                path="/onboarding"
                element={
                  <RequireAuth>
                    <OnboardingPage />
                  </RequireAuth>
                }
              />

              {/* Protected + onboarding-complete shell */}
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <RequireOnboarding>
                      <AppShell />
                    </RequireOnboarding>
                  </RequireAuth>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="jobs" element={<JobsPage />} />
                <Route path="jobs/:id" element={<JobDetailPage />} />
                <Route path="cvs" element={<CVsPage />} />
                <Route path="applications" element={<ApplicationsPage />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>

          {/* Global overlays */}
          <ToastRenderer />
          <ConfirmDialog />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
