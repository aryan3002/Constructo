/**
 * Drawer — right-side slide-over panel.
 *
 * Rendered via createPortal so it sits above all other page content.
 * Full focus-trap / Esc / return-focus / body-scroll-lock via useDialog.
 *
 * Props:
 *   open        — controlled visibility
 *   onClose     — called when overlay clicked, close button clicked, or Esc
 *   title       — panel heading (required; used as aria-label for the dialog)
 *   children    — scrollable body content
 *   footer      — optional sticky footer (pass Buttons, save bars, etc.)
 *   widthClass  — Tailwind max-w-* class; defaults to max-w-lg (32 rem)
 */

import { useRef, useId, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from './useDialog'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  widthClass?: string
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  widthClass = 'max-w-lg',
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // entered=true triggers the CSS enter transition (false = "from" state).
  // Two nested rAFs: first paint renders the "from" state so the browser can
  // interpolate; the second flips to "to". On close we unmount immediately
  // (instant leave) which is simplest, test-safe, and acceptable per spec.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    let id1: number
    let id2: number
    id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        setEntered(true)
      })
    })
    return () => {
      cancelAnimationFrame(id1)
      cancelAnimationFrame(id2)
    }
  }, [open])

  useDialog({ open, onClose, panelRef })

  if (!open) return null

  return createPortal(
    <>
      {/* Overlay — semi-opaque scrim, click → close.
          Fades in from transparent; cstk-animate collapses transition under
          prefers-reduced-motion: reduce (theme.css). */}
      <div
        aria-hidden="true"
        className={[
          'fixed inset-0 z-40 bg-[var(--scrim)] cstk-animate',
          'transition-opacity duration-200',
          entered ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        onClick={onClose}
      />

      {/* Panel — slides in from the right.
          • entered=false → translate-x-full (off-screen right) + opacity-0
          • entered=true  → translate-x-0 + opacity-100
          • cstk-animate forces transition: none under prefers-reduced-motion
            so .translate-x-full is never shown (instant mount at final position). */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-state={entered ? 'open' : 'closed'}
        className={[
          'fixed inset-y-0 right-0 z-50 flex flex-col',
          'w-full bg-card shadow-sheet border-l border-[var(--divider)]',
          widthClass,
          'transition-[transform,opacity] duration-200 ease-out cstk-animate',
          entered ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--divider)] px-5 py-4">
          <h2
            id={titleId}
            className="font-display font-semibold text-h1 text-text"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={[
              'inline-flex min-h-tap min-w-[48px] items-center justify-center',
              'rounded-control text-text-mute cstk-animate',
              'hover:bg-surface-hover hover:text-text',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            ].join(' ')}
          >
            {/* × */}
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>

        {/* Optional sticky footer */}
        {footer ? (
          <div className="shrink-0 border-t border-[var(--divider)] px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  )
}
