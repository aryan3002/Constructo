import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { clearToken } from '../api/auth'
import { useT } from '../i18n'
import { SettingsIcon, SignOutIcon } from './icons'

export function AvatarMenu({ roleBadge }: { roleBadge: { name: string; initials: string } }) {
  const t = useT()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  function signOut() {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={roleBadge.name}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-subtle font-display text-small font-bold text-brand-text ring-2 ring-surface-card cstk-animate transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {roleBadge.initials}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={roleBadge.name}
          className="absolute right-0 top-full z-50 mt-2 w-56 animate-reveal-down overflow-hidden rounded-sheet border border-edge bg-surface-overlay p-1.5 shadow-pop"
        >
          <div className="px-3 py-2">
            <div className="truncate font-body text-small font-semibold text-text-primary">{roleBadge.name}</div>
          </div>
          <div className="my-1 border-t border-edge" />
          <NavLink
            to="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-tap items-center gap-3 rounded-control px-3 font-body text-small font-semibold text-text-primary cstk-animate transition hover:bg-surface-hover"
          >
            <SettingsIcon className="text-text-muted" aria-hidden />
            <span>{t('shell.profile_settings')}</span>
          </NavLink>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex min-h-tap w-full items-center gap-3 rounded-control px-3 text-left font-body text-small font-semibold text-risk cstk-animate transition hover:bg-surface-hover"
          >
            <SignOutIcon aria-hidden />
            <span>{t('settings.signout')}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
