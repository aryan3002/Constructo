/**
 * useDialog — shared focus-trap + Esc + body-scroll-lock hook.
 *
 * Used by both Drawer and Modal so the a11y behaviour lives in exactly one
 * place. Call with:
 *   const panelRef = useRef<HTMLDivElement>(null)
 *   useDialog({ open, onClose, panelRef })
 *
 * Guarantees (per WCAG 2.1 / APG dialog pattern):
 *   • On open  — moves focus to the first focusable element inside the panel
 *                (or the panel itself if nothing is focusable inside).
 *   • While open — Tab / Shift-Tab cycle within the panel; focus can never
 *                  escape to the page behind.
 *   • Esc      — calls onClose (only the topmost stacked dialog reacts).
 *   • On close — restores focus to whichever element held focus before the
 *                dialog was opened.
 *   • Body scroll — locked (overflow-hidden) while open, restored on close.
 *
 * Fix 1 — stacked-dialog Esc: a module-level `openDialogs` symbol stack ensures
 *   only the topmost dialog's Esc handler calls onClose.  stopImmediatePropagation
 *   is NOT sufficient alone because both capture-phase listeners are on the same
 *   node (document) and run in registration order (oldest first); the lower dialog's
 *   listener fires BEFORE the upper dialog's.  Guarding by stack position is the
 *   correct, robust solution.
 *
 * Fix 2 — stale return-focus: onClose is stored in a ref so that if the parent
 *   re-renders with a new inline callback while the dialog is open, the effect
 *   deps ([open, panelRef]) do NOT re-run, keeping returnFocusTo stable.
 */

import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// ---------------------------------------------------------------------------
// Module-level dialog stack (Fix 1)
// Each open useDialog instance pushes its symbol here; only the top wins Esc.
// ---------------------------------------------------------------------------

const openDialogs: symbol[] = []

interface UseDialogOptions {
  open: boolean
  onClose: () => void
  panelRef: React.RefObject<HTMLElement | null>
}

export function useDialog({ open, onClose, panelRef }: UseDialogOptions): void {
  // Fix 2 — keep onClose in a ref so the main effect doesn't re-run when the
  // caller passes a new inline function on each render while the dialog is open.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Remember what had focus before we opened so we can return it.
  const returnFocusTo = useRef<Element | null>(null)

  // Stable identity for this dialog instance (Fix 1).
  const dialogId = useRef<symbol>(Symbol('dialog'))

  // Fix 2: deps are [open, panelRef] only — onClose intentionally omitted.
  useEffect(() => {
    if (!open) return

    // Push this dialog onto the stack (Fix 1).
    const id = dialogId.current
    openDialogs.push(id)

    // Capture the current focus target to restore later.
    returnFocusTo.current = document.activeElement

    // Lock body scroll.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus into the panel: first focusable element, or the panel itself.
    const panel = panelRef.current
    if (panel) {
      const first = panel.querySelectorAll<HTMLElement>(FOCUSABLE)[0]
      if (first) {
        first.focus()
      } else {
        // Make the panel itself focusable as a last resort so Esc still works.
        if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1')
        panel.focus()
      }
    }

    // --- Focus trap ---
    function trapFocus(e: KeyboardEvent) {
      if (!panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    // --- Esc closes (Fix 1: only if this dialog is the topmost) ---
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Only the topmost dialog on the stack should react.
        if (openDialogs[openDialogs.length - 1] === id) {
          e.stopImmediatePropagation()
          onCloseRef.current()
        }
        return
      }
      trapFocus(e)
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)

      // Pop this dialog from the stack (Fix 1).
      const idx = openDialogs.lastIndexOf(id)
      if (idx !== -1) openDialogs.splice(idx, 1)

      // Restore body scroll.
      document.body.style.overflow = prevOverflow

      // Return focus to where it was (Fix 2: returnFocusTo was captured at open
      // time and is unaffected by onClose identity changes).
      const el = returnFocusTo.current
      if (el && typeof (el as HTMLElement).focus === 'function') {
        // Use setTimeout(0) so the DOM has settled (portal unmounted) before
        // we move focus back.
        setTimeout(() => (el as HTMLElement).focus(), 0)
      }
      returnFocusTo.current = null
    }
    // Fix 2: onClose deliberately excluded — use onCloseRef instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panelRef])
}
