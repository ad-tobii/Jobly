import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, FileText,
  ClipboardList, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react'
import useAuthStore from '../../store/authStore.js'
import useToastStore from '../../store/toastStore.js'

const NAV = [
  { to: '/dashboard',    label: 'Dashboard',   Icon: LayoutDashboard },
  { to: '/jobs',         label: 'Jobs',         Icon: Briefcase },
  { to: '/cvs',          label: 'My CVs',       Icon: FileText },
  { to: '/applications', label: 'Applications', Icon: ClipboardList },
]

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const logout = useAuthStore((s) => s.logout)
  const user   = useAuthStore((s) => s.user)
  const toastSuccess = useToastStore((s) => s.success)
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    toastSuccess('Logged out')
    navigate('/login')
  }

  const sidebarW = collapsed ? 'w-12' : 'w-[220px]'
  const mainML   = collapsed ? 'ml-12' : 'ml-[220px]'

  return (
    <div className="flex min-h-screen bg-app">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 ${sidebarW} bg-subtle border-r border-border-faint flex flex-col z-40 transition-all duration-200 overflow-hidden`}>

        {/* Logo row */}
        <div className={`flex items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-4'} h-14 border-b border-border-faint shrink-0`}>
          {!collapsed && (
            <span className="font-semibold text-[17px] text-primary">Jobly</span>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-secondary hover:bg-overlay hover:text-primary transition-colors duration-[120ms]"
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 h-8 mx-2 px-3 rounded-md text-[13px] font-medium no-underline transition-colors duration-[120ms] border-l-2 ` +
                (isActive
                  ? 'bg-accent-subtle text-accent border-accent'
                  : 'text-secondary hover:bg-overlay hover:text-primary border-transparent')
              }
            >
              <Icon size={15} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-border-faint py-2 shrink-0">
          {!collapsed && user?.email && (
            <p className="px-4 pt-1 pb-0.5 text-[11px] text-tertiary truncate">{user.email}</p>
          )}
          <button
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className="flex items-center gap-3 h-8 mx-2 px-3 w-[calc(100%-16px)] rounded-md text-[13px] font-medium text-secondary hover:bg-overlay hover:text-primary transition-colors duration-[120ms] border-l-2 border-transparent"
          >
            <LogOut size={15} className="shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className={`${mainML} flex-1 flex flex-col min-w-0 transition-all duration-200`}>
        <Outlet />
      </main>
    </div>
  )
}
