// Reconcile cockpit keyboard engine (W2.3, vault 11/00 W2 + 04 §4.1).
//
// The accountant closes a month WITHOUT the mouse: ↑/↓ scan the queue, Enter
// opens the selected row's three-way detail, H holds payment, F flags. There is
// zero `onKeyDown` in the reconcile screens today — this is the whole engine.
//
// History discipline (04 §4.1): cursor MOVES are `replace` (a scan must not
// pollute the back stack), an explicit OPEN is `push` (back returns to where you
// were). The hook is presentation-only: it computes the next index and calls the
// supplied callbacks; the page owns the URL/selection so this stays testable.
import { useEffect } from 'react'

export interface CockpitKeyHandlers {
  /** Ordered row keys, worst-first (the visible queue order). */
  keys: string[]
  /** Currently selected row key, or null. */
  selectedKey: string | null
  /** Move the cursor to `key` (page maps this to a `replace` URL update). */
  onMove: (key: string) => void
  /** Open `key`'s detail (page maps this to a `push` URL update). */
  onOpen?: (key: string) => void
  /** Hold payment on the selected row. */
  onHold?: (key: string) => void
  /** Flag the selected row for review. */
  onFlag?: (key: string) => void
  /** Disable the listener (e.g. while a dialog/input is focused). */
  enabled?: boolean
}

/** True when focus is in a typing context — we must not hijack those keys. */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  )
}

export function useCockpitKeys({
  keys,
  selectedKey,
  onMove,
  onOpen,
  onHold,
  onFlag,
  enabled = true,
}: CockpitKeyHandlers): void {
  useEffect(() => {
    if (!enabled || keys.length === 0) return

    function handle(e: KeyboardEvent) {
      // Never steal keys from a form field or while a modifier is held (those
      // are app/browser shortcuts, e.g. ⌘K).
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return

      const idx = selectedKey ? keys.indexOf(selectedKey) : -1

      switch (e.key) {
        case 'ArrowDown':
        case 'j': {
          e.preventDefault()
          const next = idx < 0 ? 0 : Math.min(idx + 1, keys.length - 1)
          onMove(keys[next])
          break
        }
        case 'ArrowUp':
        case 'k': {
          e.preventDefault()
          const prev = idx <= 0 ? 0 : idx - 1
          onMove(keys[prev])
          break
        }
        case 'Enter': {
          if (selectedKey) {
            e.preventDefault()
            onOpen?.(selectedKey)
          }
          break
        }
        case 'h':
        case 'H': {
          if (selectedKey) {
            e.preventDefault()
            onHold?.(selectedKey)
          }
          break
        }
        case 'f':
        case 'F': {
          if (selectedKey) {
            e.preventDefault()
            onFlag?.(selectedKey)
          }
          break
        }
        default:
          break
      }
    }

    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [keys, selectedKey, onMove, onOpen, onHold, onFlag, enabled])
}
