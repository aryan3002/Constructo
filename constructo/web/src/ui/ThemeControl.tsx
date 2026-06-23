import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useThemeMode, type ThemeMode } from './ThemeModeProvider'
import { SunIcon, MoonIcon, MonitorIcon } from './icons'

const OPTIONS: { mode: ThemeMode; labelKey: 'settings.appearance.light' | 'settings.appearance.dark' | 'settings.appearance.system'; Icon: typeof SunIcon }[] = [
  { mode: 'light', labelKey: 'settings.appearance.light', Icon: SunIcon },
  { mode: 'dark', labelKey: 'settings.appearance.dark', Icon: MoonIcon },
  { mode: 'system', labelKey: 'settings.appearance.system', Icon: MonitorIcon },
]

export function ThemeControl() {
  const t = useT()
  const { mode, setMode } = useThemeMode()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const Current = mode === 'dark' ? MoonIcon : mode === 'light' ? SunIcon : MonitorIcon

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('shell.appearance')}
        className="grid h-10 w-10 place-items-center rounded-control text-text-primary cstk-animate transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Current />
      </button>
      {open ? (
        <div role="menu" aria-label={t('shell.appearance')}
          className="absolute right-0 top-full z-50 mt-2 w-44 animate-reveal-down overflow-hidden rounded-sheet border border-edge bg-surface-overlay p-1.5 shadow-pop">
          {OPTIONS.map(({ mode: m, labelKey, Icon }) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={mode === m}
              onClick={() => { setMode(m); setOpen(false) }}
              className={`flex min-h-tap w-full items-center gap-3 rounded-control px-3 text-left font-body text-small font-semibold cstk-animate transition hover:bg-surface-hover ${
                mode === m ? 'text-brand-text' : 'text-text-primary'
              }`}
            >
              <Icon className="text-text-muted" aria-hidden />
              <span className="flex-1">{t(labelKey)}</span>
              {mode === m ? <span className="h-2 w-2 rounded-full bg-brand" aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
