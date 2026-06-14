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
 *   • Esc      — calls onClose.
 *   • On close — restores focus to whichever element held focus before the
 *                dialog was opened.
 *   • Body scroll — locked (overflow-hidden) while open, restored on close.
 */

import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface UseDialogOptions {
  open: boolean
  onClose: () => void
  panelRef: React.RefObject<HTMLElement | null>
}

export function useDialog({ open, onClose, panelRef }: UseDialogOptions): void {
  // Remember what had focus before we opened so we can return it.
  const returnFocusTo = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return

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

    // --- Esc closes ---
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      trapFocus(e)
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)

      // Restore body scroll.
      document.body.style.overflow = prevOverflow

      // Return focus to where it was.
      const el = returnFocusTo.current
      if (el && typeof (el as HTMLElement).focus === 'function') {
        // Use setTimeout(0) so the DOM has settled (portal unmounted) before
        // we move focus back.
        setTimeout(() => (el as HTMLElement).focus(), 0)
      }
      returnFocusTo.current = null
    }
  }, [open, onClose, panelRef])
}
