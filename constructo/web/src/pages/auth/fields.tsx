// Small form primitives shared by the auth/onboarding/settings screens.
// On-brand (warm paper, amber focus, >=48px tap targets) without adding to the
// frozen ui/ kit. Labels are always rendered (never placeholder-only) for a11y.
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { forwardRef, useEffect, useId, useRef } from 'react'
import { useT, type TranslationKey } from '../../i18n'
import { CheckIcon, WarnTriangleIcon } from '../../ui/icons'
import type { AuthErrorAction, AuthErrorView } from './authErrors'
import { digitsOnly, formatIndianMobile } from './phone'

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

// ---------------------------------------------------------------------------
// Auth-kit primitives (spec §7). Same vocabulary as the mobile auth kit:
// fixed +91 phone, single 6-digit OTP input, resend cooldown, error card with
// a next step, and step dots. All labels are real <label>s; errors carry an
// icon so state is never colour-only.
// ---------------------------------------------------------------------------

const hintClass = 'mt-1.5 font-body text-small text-text-mute'

/** Fixed `+91` prefix + 10-digit input. `digits` is the raw 10-digit value. */
export function PhoneField({
  label,
  hint,
  digits,
  onChange,
  error,
  autoFocus,
  name = 'phone',
}: {
  label: string
  hint?: ReactNode
  digits: string
  onChange: (digits: string) => void
  error?: boolean
  autoFocus?: boolean
  name?: string
}) {
  const id = useId()
  const hintId = useId()
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div
        className={
          'mt-1 flex min-h-tap items-stretch overflow-hidden rounded-control border bg-paper-2 ' +
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/40 ' +
          (error ? 'border-risk' : 'border-line')
        }
      >
        <span className="flex select-none items-center border-r border-line bg-paper px-3 cstk-mono text-body text-text-mute">
          +91
        </span>
        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          maxLength={11}
          value={formatIndianMobile(digits)}
          onChange={(e) => onChange(digitsOnly(e.target.value).slice(0, 10))}
          placeholder="98765 43210"
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={error || undefined}
          className="min-w-0 flex-1 bg-transparent px-3 cstk-mono text-body text-text placeholder:text-text-mute/70 focus:outline-none"
        />
      </div>
      {hint ? (
        <p id={hintId} className={hintClass}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Single 6-digit one-time-code input (kept as ONE input for a11y + SMS
 * autofill). Digits only; `onComplete` fires once when the 6th digit lands.
 */
export function OtpField({
  label,
  hint,
  value,
  onChange,
  onComplete,
  error,
  autoFocus,
  disabled,
}: {
  label: string
  hint?: ReactNode
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  error?: boolean
  autoFocus?: boolean
  disabled?: boolean
}) {
  const id = useId()
  const hintId = useId()
  const completedFor = useRef<string | null>(null)
  useEffect(() => {
    if (value.length < 6) completedFor.current = null
  }, [value])
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name="otp"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={6}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D+/g, '').slice(0, 6)
          onChange(v)
          if (v.length === 6 && completedFor.current !== v) {
            completedFor.current = v
            onComplete?.(v)
          }
        }}
        placeholder="······"
        aria-describedby={hint ? hintId : undefined}
        aria-invalid={error || undefined}
        className={
          `${fieldBase} cstk-mono min-h-[56px] text-center text-h1 font-semibold tracking-[0.5em] [text-indent:0.5em] ` +
          'placeholder:tracking-[0.5em] disabled:opacity-60 ' +
          (error ? '!border-risk' : '')
        }
      />
      {hint ? (
        <p id={hintId} className={hintClass}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** "Resend in 30s" → "Resend code" link, with an optional "Code sent again" confirmation. */
export function ResendCode({
  seconds,
  onResend,
  resent,
  busy,
}: {
  seconds: number
  onResend: () => void
  resent?: boolean
  busy?: boolean
}) {
  const t = useT()
  return (
    <div className="flex min-h-tap flex-wrap items-center gap-x-3 gap-y-1 font-body text-small text-text-mute">
      {resent ? (
        <span className="inline-flex items-center gap-1 font-medium text-ok-fg" aria-live="polite">
          <span className="text-[1.1em]" aria-hidden>
            <CheckIcon />
          </span>
          {t('auth.code_resent')}
        </span>
      ) : null}
      {seconds > 0 ? (
        <span className="cstk-mono tabular-nums">{t('auth.action.resend_in', { s: seconds })}</span>
      ) : (
        <button
          type="button"
          onClick={onResend}
          disabled={busy}
          className="min-h-tap font-semibold text-primary-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-control px-1 disabled:opacity-50"
        >
          {t('auth.action.resend')}
        </button>
      )}
    </div>
  )
}

const ACTION_KEY: Record<AuthErrorAction, TranslationKey> = {
  useJoinCode: 'auth.action.use_join_code',
  signIn: 'auth.action.sign_in',
  help: 'auth.action.help',
  retry: 'auth.action.retry',
  changeNumber: 'auth.action.change_phone',
}

/** Error card: icon + friendly message + the next step (spec §6). Never colour-only. */
export function AuthError({
  view,
  onAction,
}: {
  view: AuthErrorView | null
  onAction?: (action: AuthErrorAction) => void
}) {
  const t = useT()
  if (!view) return null
  const action = view.action
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-control border border-risk/30 bg-risk-bg px-3 py-3"
    >
      <span className="mt-0.5 shrink-0 text-[1.25em] leading-none text-risk" aria-hidden>
        <WarnTriangleIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-body text-small font-medium text-risk-fg">{t(view.messageKey)}</p>
        {action && onAction ? (
          <button
            type="button"
            onClick={() => onAction(action)}
            className="mt-1 inline-flex min-h-tap items-center font-body text-small font-semibold text-risk-fg underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-risk rounded-control"
          >
            {t(ACTION_KEY[action])} →
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** 2–3 progress dots + "Step n of total". Static (reduce-motion safe). */
export function StepDots({ n, total }: { n: number; total: number }) {
  const t = useT()
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => {
          const state = i + 1 < n ? 'done' : i + 1 === n ? 'active' : 'idle'
          return (
            <span
              key={i}
              data-testid="step-dot"
              data-state={state}
              className={
                'h-2 rounded-full cstk-animate transition-all ' +
                (state === 'active'
                  ? 'w-6 bg-primary'
                  : state === 'done'
                    ? 'w-2 bg-text'
                    : 'w-2 bg-line')
              }
            />
          )
        })}
      </div>
      <span className="font-body text-micro font-semibold uppercase tracking-widest text-text-mute">
        {t('auth.step_of', { n, total })}
      </span>
    </div>
  )
}
