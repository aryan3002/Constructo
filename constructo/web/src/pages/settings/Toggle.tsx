import { useId, type ReactNode } from 'react'

/**
 * Accessible on/off switch. role="switch" + label association; >=48px tap
 * target. Used for the sunlight toggle and notification prefs.
 */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="block font-body text-body text-text">
          {label}
        </label>
        {hint ? (
          <p className="font-body text-micro text-text-mute">{hint}</p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border border-line cstk-animate transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          checked ? 'bg-primary' : 'bg-paper'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-paper-2 shadow-card transition ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
