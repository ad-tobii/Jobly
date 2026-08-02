import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import useAuthStore from '../../store/authStore.js'
import useToastStore from '../../store/toastStore.js'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/jobs', label: 'Jobs', Icon: Briefcase },
  { to: '/cvs', label: 'My CVs', Icon: FileText },
  { to: '/applications', label: 'Applications', Icon: ClipboardList },
]

const COLLAPSE_KEY = 'jobly_sidebar_collapsed'

function initials(user: JoblyUser | null) {
  const source = user?.full_name?.trim() || user?.email || ''
  if (!source) return '?'
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  return (parts[0]?.[0] || '?').concat(parts[1]?.[0] || '').toUpperCase()
}

/** Nav list — shared by the desktop rail and the mobile drawer. */
function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-2">
      {NAV.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            'mb-0.5 flex h-8 items-center gap-3 rounded-md border-l-2 px-2.5 text-[13px] font-medium no-underline ' +
            'outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-accent-muted ' +
            (isActive
              ? 'border-accent bg-accent-subtle text-accent'
              : 'border-transparent text-secondary hover:bg-overlay hover:text-primary')
          }
        >
          <Icon size={16} strokeWidth={1.5} className="shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </NavLink>
      ))}
    </nav>
  )
}

export default function AppShell() {
  // Persist the desktop collapse choice; it's a per-user layout preference.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === 'true',
  )
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const toastSuccess = useToastStore((s) => s.success)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, String(collapsed))
  }, [collapsed])

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setIsDrawerOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isDrawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDrawerOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isDrawerOpen])

  const handleLogout = async () => {
    await logout()
    toastSuccess('Logged out')
    navigate('/login')
  }

  const sidebarWidth = collapsed ? 'lg:w-12' : 'lg:w-[220px]'
  const mainOffset = collapsed ? 'lg:ml-12' : 'lg:ml-[220px]'

  const userBlock = (compact: boolean) => (
    <div className="shrink-0 border-t border-border-faint p-2">
      {!compact && user && (
        <div className="mb-1 flex items-center gap-2.5 px-1.5 py-1.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[11px] font-semibold text-accent">
            {initials(user)}
          </span>
          <span className="min-w-0 flex-1">
            {user.full_name && (
              <span className="block truncate text-[12px] font-medium text-primary">{user.full_name}</span>
            )}
            <span className="block truncate text-[11px] text-tertiary">{user.email}</span>
          </span>
        </div>
      )}
      <button
        onClick={handleLogout}
        title={compact ? 'Log out' : undefined}
        className="flex h-8 w-full items-center gap-3 rounded-md border-l-2 border-transparent px-2.5 text-[13px] font-medium text-secondary outline-none transition-colors duration-[120ms] hover:bg-overlay hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-muted"
      >
        <LogOut size={16} strokeWidth={1.5} className="shrink-0" />
        {!compact && <span>Log out</span>}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-app">
      {/* ── Mobile top bar ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-faint bg-subtle px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          aria-label="Open navigation"
          aria-expanded={isDrawerOpen}
          className="flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors duration-[120ms] hover:bg-overlay hover:text-primary"
        >
          <Menu size={18} />
        </button>
        <span className="font-display text-[16px] font-semibold text-primary">Jobly</span>
      </header>

      {/* ── Mobile drawer ─────────────────────────────────────────────────── */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] animate-fade-in lg:hidden"
          onClick={() => setIsDrawerOpen(false)}
          role="presentation"
        >
          <aside
            onClick={(event) => event.stopPropagation()}
            className="flex h-full w-[260px] flex-col border-r border-border-faint bg-subtle"
            style={{ animation: 'slide-in-left var(--duration-drawer) var(--ease-out)' }}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-faint px-4">
              <span className="font-display text-[17px] font-semibold text-primary">Jobly</span>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Close navigation"
                className="flex h-7 w-7 items-center justify-center rounded-md text-secondary hover:bg-overlay hover:text-primary"
              >
                <X size={16} />
              </button>
            </div>
            <NavList collapsed={false} onNavigate={() => setIsDrawerOpen(false)} />
            {userBlock(false)}
          </aside>
        </div>
      )}

      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col overflow-hidden border-r border-border-faint bg-subtle transition-[width] duration-200 lg:flex ${sidebarWidth}`}
      >
        <div
          className={`flex h-14 shrink-0 items-center border-b border-border-faint ${
            collapsed ? 'justify-center px-0' : 'justify-between px-4'
          }`}
        >
          {!collapsed && <span className="font-display text-[17px] font-semibold text-primary">Jobly</span>}
          <button
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-7 w-7 items-center justify-center rounded-md text-secondary outline-none transition-colors duration-[120ms] hover:bg-overlay hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-muted"
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        <NavList collapsed={collapsed} />
        {userBlock(collapsed)}
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className={`flex min-w-0 flex-col transition-[margin] duration-200 ${mainOffset}`}>
        <Outlet />
      </main>
    </div>
  )
}
