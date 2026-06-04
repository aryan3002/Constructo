import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { roleCan, type Capability } from '../../auth/permissions'
import { useMeRole } from '../../auth/useCan'
import { useUiStore } from '../../store/ui'
import { SearchIcon } from '../../ui/icons'
import { useThemeMode } from '../../ui/ThemeModeProvider'

interface Command {
  id: string
  label: string
  hint?: string
  cap?: Capability
  run: () => void
}

/**
 * ⌘K command palette (vault 11/04 §5.3). Mounted once globally; opens on
 * ⌘K / Ctrl+K from anywhere, capability-filters its actions to the current role,
 * and is keyboard-driven (↑/↓/Enter/Esc). UI shaping only — routes the user, the
 * API still enforces authorization.
 */
export function CommandPalette() {
  const open = useUiStore((s) => s.commandOpen)
  const setOpen = useUiStore((s) => s.setCommandOpen)
  const toggle = useUiStore((s) => s.toggleCommand)
  const navigate = useNavigate()
  const { resolved, setMode } = useThemeMode()
  const role = useMeRole()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global ⌘K / Ctrl+K toggle + Esc close (works from any screen).
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, setOpen])

  // Reset + focus the input each time it opens.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      setOpen(false)
      navigate(to)
    }
    return [
      { id: 'brief', label: 'Go to Brief', hint: 'Owner / PM', cap: 'view_brief', run: go('/') },
      { id: 'sites', label: 'Go to Sites', run: go('/sites') },
      { id: 'approvals', label: 'Go to Approvals', run: go('/approvals') },
      { id: 'reconcile', label: 'Go to Reconcile', cap: 'reconcile', run: go('/reconcile') },
      { id: 'payments', label: 'Go to Payments', hint: 'Tracking', cap: 'view_payments', run: go('/payments') },
      { id: 'permits', label: 'Go to Permits', cap: 'view_permits', run: go('/permits') },
      { id: 'search', label: 'Search the ledger', cap: 'search', run: go('/search') },
      { id: 'settings', label: 'Open Settings', run: go('/settings') },
      {
        id: 'theme',
        label: `Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`,
        hint: 'Appearance',
        run: () => {
          setMode(resolved === 'dark' ? 'light' : 'dark')
          setOpen(false)
        },
      },
    ]
  }, [navigate, setOpen, resolved, setMode])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return commands.filter((c) => {
      if (c.cap && !roleCan(role, c.cap)) return false
      if (!q) return true
      return (
        c.label.toLowerCase().includes(q) || (c.hint?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [commands, query, role])

  if (!open) return null

  const activeIdx = Math.min(active, Math.max(0, results.length - 1))

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      results[activeIdx]?.run()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div className="absolute inset-0 bg-[color:var(--scrim)]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg overflow-hidden rounded-sheet border border-line bg-[color:var(--surface-overlay)] shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <SearchIcon className="text-[1.1em] text-text-mute" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to… (type a screen)"
            aria-label="Command palette search"
            className="w-full bg-transparent font-body text-body text-text placeholder:text-text-mute focus:outline-none"
          />
          <kbd className="cstk-mono rounded border border-line px-1.5 py-0.5 text-micro text-text-mute">
            esc
          </kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox" aria-label="Commands">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center font-body text-small text-text-mute">
              No matches.
            </li>
          ) : (
            results.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === activeIdx}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => c.run()}
                  className={`flex w-full items-center justify-between gap-3 rounded-control px-3 py-2.5 text-left font-body text-small transition-colors ${
                    i === activeIdx
                      ? 'bg-surface-selected text-text'
                      : 'text-text hover:bg-surface-hover'
                  }`}
                >
                  <span>{c.label}</span>
                  {c.hint ? <span className="text-micro text-text-mute">{c.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
