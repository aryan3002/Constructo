// Small form primitives shared by the auth/onboarding/settings screens.
// On-brand (warm paper, amber focus, >=48px tap targets) without adding to the
// frozen ui/ kit. Labels are always rendered (never placeholder-only) for a11y.
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { forwardRef, useId } from 'react'

const fieldBase =
  'mt-1 w-full min-h-tap rounded-control border border-line bg-paper-2 px-3 ' +
  'font-body text-body text-text placeholder:text-text-mute ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40'

const labelClass = 'block font-body text-small font-semibold text-text'

// forwardRef so React-Hook-Form's `register()` ref reaches the real <input>
// (a plain function component would swallow the ref). Controlled callers that
// pass no ref are unaffected.
export const TextField = forwardRef<
  HTMLInputElement,
  {
    label: string
    hint?: ReactNode
    mono?: boolean
  } & InputHTMLAttributes<HTMLInputElement>
>(function TextField({ label, hint, mono, ...rest }, ref) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        className={`${fieldBase} ${mono ? 'cstk-mono' : ''}`}
        {...rest}
      />
      {hint ? (
        <p className="mt-1 font-body text-micro text-text-mute">{hint}</p>
      ) : null}
    </div>
  )
})

// forwardRef (like TextField) so RHF's register() ref reaches the <select>.
export const SelectField = forwardRef<
  HTMLSelectElement,
  {
    label: string
    children: ReactNode
  } & SelectHTMLAttributes<HTMLSelectElement>
>(function SelectField({ label, children, ...rest }, ref) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select id={id} ref={ref} className={fieldBase} {...rest}>
        {children}
      </select>
    </div>
  )
})

/** Centered card frame used by the signed-out auth screens. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-sheet border border-line bg-card p-6 shadow-card">
        {children}
      </div>
    </div>
  )
}
