/**
 * Toast — lightweight notification stack.
 *
 * Usage:
 *   // 1. Wrap your app root in <ToastProvider> (done in main.tsx).
 *   // 2. Call useToast() anywhere inside the tree.
 *   const { show } = useToast()
 *   show({ status: 'ok', message: 'Saved!' })
 *   show({ status: 'risk', message: 'Upload failed', ttlMs: 8000 })
 *
 * Features:
 *   • Fixed stack (bottom-right)
 *   • Status-tinted card using Blueprint tokens (never hardcoded hex)
 *   • role="status" + aria-live="polite" for screen reader announcements
 *   • Auto-dismiss after ttlMs (default 4 s); timer cleared on unmount/dismiss
 *   • Manual dismiss button on every toast
 *   • Max 4 visible; newest on top
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import { STATUS_META } from './StatusPill'
import type { Status } from './StatusPill'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToastItem {
  id: string
  status: Status
  message: string
  ttlMs: number
}

export interface ShowToastOptions {
  status: Status
  message: string
  ttlMs?: number
}

interface ToastContextValue {
  show: (opts: ShowToastOptions) => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null)

// ---------------------------------------------------------------------------
// Individual toast card
// ---------------------------------------------------------------------------

const STATUS_TOAST_CLASSES: Record<Status, string> = {
  ok:   'bg-ok-bg text-ok-fg border-ok/30',
  warn: 'bg-warn-bg text-warn-fg border-warn/30',
  risk: 'bg-risk-bg text-risk-fg border-risk/30',
  info: 'bg-info-bg text-info-fg border-info/30',
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem
  onDismiss: (id: string) => void
}) {
  const meta = STATUS_META[toast.status]

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.ttlMs)
    return () => clearTimeout(timer)
  }, [toast.id, toast.ttlMs, onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[
        'flex items-start gap-3 rounded-card border px-4 py-3 shadow-card',
        'font-body text-small font-semibold w-[22rem] max-w-[calc(100vw-2rem)]',
        'cstk-animate',
        STATUS_TOAST_CLASSES[toast.status],
      ].join(' ')}
    >
      {/* Status icon */}
      <span
        className="mt-0.5 shrink-0 text-[1.1em] leading-none"
        aria-hidden="true"
      >
        <meta.Icon />
      </span>

      {/* Message */}
      <span className="flex-1 leading-snug">{toast.message}</span>

      {/* Dismiss */}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className={[
          'inline-flex shrink-0 items-center justify-center',
          'h-6 w-6 rounded-control opacity-70',
          'hover:opacity-100 cstk-animate',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current',
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const MAX_TOASTS = 4
const DEFAULT_TTL = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counterRef = useRef(0)

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((opts: ShowToastOptions) => {
    const id = `toast-${++counterRef.current}`
    const item: ToastItem = {
      id,
      status: opts.status,
      message: opts.message,
      ttlMs: opts.ttlMs ?? DEFAULT_TTL,
    }
    setToasts((prev) => {
      const next = [item, ...prev]
      // Cap at MAX_TOASTS — drop the oldest (last in array)
      return next.slice(0, MAX_TOASTS)
    })
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}

      {/* Fixed toast stack — bottom-right */}
      {toasts.length > 0 && (
        <div
          aria-label="Notifications"
          className={[
            'fixed bottom-4 right-4 z-[9999]',
            'flex flex-col gap-2 items-end',
          ].join(' ')}
        >
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>')
  }
  return ctx
}
