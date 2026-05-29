import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to fill the container — common for the single primary action. */
  block?: boolean
  /** Optional leading icon node. */
  leadingIcon?: ReactNode
  children?: ReactNode
}

// Base: >=48px tap target, body font, decisive radius, motion-safe press state.
const base =
  'inline-flex items-center justify-center gap-2 select-none font-body font-semibold ' +
  'rounded-control min-h-tap px-5 text-body cstk-animate transition ' +
  'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-bg ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100'

const variants: Record<ButtonVariant, string> = {
  // PRIMARY = amber, dark ink label (reads best on amber), deepens on press.
  primary:
    'bg-primary text-on-primary shadow-card hover:bg-primary-deep ' +
    'active:bg-primary-deep focus-visible:ring-primary',
  secondary:
    'bg-card text-text border border-line hover:bg-paper ' +
    'active:bg-paper focus-visible:ring-primary',
  ghost:
    'bg-transparent text-text hover:bg-line/40 active:bg-line/60 ' +
    'focus-visible:ring-primary',
  danger:
    'bg-risk text-white shadow-card hover:brightness-95 ' +
    'active:brightness-90 focus-visible:ring-risk',
}

const sizes: Record<ButtonSize, string> = {
  md: '', // min-h-tap (48px) is the floor
  lg: 'min-h-[56px] text-h2 px-6',
}

/**
 * Constructo Button. Amber primary is the one decisive action per screen.
 * Always >=48px tall with a pressed state; fully keyboard-accessible.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      block,
      leadingIcon,
      className,
      type = 'button',
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`${base} ${variants[variant]} ${sizes[size]} ${
          block ? 'w-full' : ''
        } ${className ?? ''}`.trim()}
        {...rest}
      >
        {leadingIcon ? (
          <span className="text-[1.25em] leading-none" aria-hidden>
            {leadingIcon}
          </span>
        ) : null}
        {children}
      </button>
    )
  },
)
