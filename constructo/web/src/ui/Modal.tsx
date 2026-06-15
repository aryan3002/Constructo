/**
 * Modal — centered dialog + ConfirmDialog convenience wrapper.
 *
 * Both components are rendered via createPortal with full a11y:
 *   • role="dialog" + aria-modal + aria-labelledby
 *   • Focus trap / Esc / return-focus / body-scroll-lock via useDialog
 *   • Overlay click → onClose
 *
 * ConfirmDialog additionally:
 *   • Supports variant="danger" (red confirm) + busy spinner
 */

import { useRef, useId } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from './useDialog'
import { Button } from './Button'

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useDialog({ open, onClose, panelRef })

  if (!open) return null

  return createPortal(
    <>
      {/* Overlay — semi-opaque scrim, aria-hidden (purely visual) */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-[var(--scrim)] cstk-animate"
        onClick={onClose}
      />

      {/* Centering shell — NOT aria-hidden; the dialog inside must be in the a11y tree */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        {/* Panel — pointer-events-auto so clicks inside work; stop propagation is not needed
            because the centering shell has pointer-events-none (overlay handles click-outside) */}
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={[
            'relative flex flex-col w-full max-w-md pointer-events-auto',
            'bg-card rounded-sheet shadow-pop',
            'cstk-animate',
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

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {children}
          </div>

          {/* Optional footer */}
          {footer ? (
            <div className="shrink-0 border-t border-[var(--divider)] px-5 py-4">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// ConfirmDialog — thin layer on Modal
// ---------------------------------------------------------------------------

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** 'primary' = amber CTA (default); 'danger' = red destructive action. */
  variant?: 'primary' | 'danger'
  /** While busy, the confirm button shows a spinner and is disabled. */
  busy?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  busy = false,
}: ConfirmDialogProps) {
  const footer = (
    <div className="flex justify-end gap-3">
      <Button variant="ghost" onClick={onClose} type="button">
        {cancelLabel}
      </Button>
      <Button
        variant={variant === 'danger' ? 'danger' : 'primary'}
        onClick={onConfirm}
        disabled={busy}
        type="button"
        data-variant={variant}
        aria-busy={busy ? 'true' : undefined}
      >
        {busy ? (
          <>
            {/* Fix 4 — motion-reduce:animate-none respects prefers-reduced-motion */}
            <span
              className="inline-block h-4 w-4 animate-spin motion-reduce:animate-none rounded-full border-2 border-white/30 border-t-white"
              aria-hidden="true"
            />
            {confirmLabel}
          </>
        ) : (
          confirmLabel
        )}
      </Button>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={title} footer={footer}>
      <p className="font-body text-body text-text-mute">{message}</p>
    </Modal>
  )
}
