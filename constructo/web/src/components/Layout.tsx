import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearToken } from '../api/auth'
import { USE_MOCKS } from '../api/config'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/sites', label: 'Sites', end: false },
  { to: '/groups', label: 'WhatsApp Groups', end: false },
]

export function Layout() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md px-3 py-2 text-sm font-medium ${
      isActive
        ? 'bg-brand-600 text-white'
        : 'text-slate-700 hover:bg-slate-100'
    }`

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-brand-700">Constructo</span>
            {USE_MOCKS && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                Mock data
              </span>
            )}
          </div>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 sm:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={handleLogout}
              className="ml-2 rounded-md px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              Logout
            </button>
          </nav>

          {/* Mobile toggle */}
          <button
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 sm:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            <span className="block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
          </button>
        </div>

        {/* Mobile nav */}
        {open && (
          <nav className="space-y-1 border-t border-slate-200 px-4 py-3 sm:hidden">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={linkClass}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={handleLogout}
              className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              Logout
            </button>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
