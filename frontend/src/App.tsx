import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './store/authStore.js'

// Pages (lazy stubs — filled screen by screen)
import LoginPage      from './pages/LoginPage.tsx'
import SignupPage     from './pages/SignupPage.tsx'
import OnboardingPage from './pages/OnboardingPage.tsx'
import DashboardPage  from './pages/DashboardPage.tsx'
import JobsPage       from './pages/JobsPage.tsx'
import JobDetailPage  from './pages/JobDetailPage.tsx'
import CVsPage        from './pages/CVsPage.tsx'
import ApplicationsPage from './pages/ApplicationsPage.tsx'

// Global UI
import ToastRenderer   from './components/ui/ToastRenderer.tsx'
import ConfirmDialog   from './components/ui/ConfirmDialog.tsx'
import AppShell        from './components/layout/AppShell.tsx'

// ── Auth guard ────────────────────────────────────────────────────────────────
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
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login"  element={<LoginPage />} />
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
          <Route path="dashboard"    element={<DashboardPage />} />
          <Route path="jobs"         element={<JobsPage />} />
          <Route path="jobs/:id"     element={<JobDetailPage />} />
          <Route path="cvs"          element={<CVsPage />} />
          <Route path="applications" element={<ApplicationsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Global overlays */}
      <ToastRenderer />
      <ConfirmDialog />
    </BrowserRouter>
  )
}
