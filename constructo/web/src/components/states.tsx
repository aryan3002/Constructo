import type { ReactNode } from 'react'

/**
 * Shared loading / error / empty states, on the Blueprint design system (warm
 * --paper surfaces, status spine, ≥48px retry target). Used across every screen
 * so the whole app shares one visual language.
 */
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-3 py-12 font-body text-body text-text-mute"
      role="status"
      aria-live="polite"
    >
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Retry',
}: {
  message: string
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <div className="rounded-card border border-risk/30 bg-risk/10 p-6 text-center">
      <p className="flex items-center justify-center gap-2 font-body font-semibold text-risk">
        <span aria-hidden>⚠</span>
        <span>{message}</span>
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex min-h-tap items-center justify-center rounded-control bg-risk px-4 font-body text-small font-semibold text-white cstk-animate hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-risk/50"
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-card border border-dashed border-line bg-card p-10 text-center">
      <p className="font-body font-semibold text-text">{title}</p>
      {hint && <p className="mt-1 font-body text-small text-text-mute">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
