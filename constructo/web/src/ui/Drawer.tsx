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

import { useRef, useId } from 'react'
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

  useDialog({ open, onClose, panelRef })

  if (!open) return null

  return createPortal(
    <>
      {/* Overlay — semi-opaque scrim, click → close */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-[var(--scrim)] cstk-animate"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          'fixed inset-y-0 right-0 z-50 flex flex-col',
          'w-full bg-card shadow-sheet border-l border-[var(--divider)]',
          widthClass,
          // Slide-in from right; motion-safe guard lives in .cstk-animate in theme.css
          'translate-x-0 transition-transform duration-160 cstk-animate',
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
