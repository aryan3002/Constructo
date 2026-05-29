import type { ElementType, HTMLAttributes, ReactNode } from 'react'

/**
 * Constructo typography primitives. They encode the mobile type scale and the
 * three families (Anek display, Hind body, Spline Sans Mono numerals) so screens
 * never hardcode font sizes. Each accepts an `as` override for correct semantics
 * (e.g. render a Display as an <h1>).
 */

type Props = HTMLAttributes<HTMLElement> & {
  as?: ElementType
  className?: string
  children?: ReactNode
}

function make(defaultTag: ElementType, baseClass: string) {
  return function Text({ as, className, children, ...rest }: Props) {
    const Tag = as ?? defaultTag
    return (
      <Tag className={`${baseClass} ${className ?? ''}`.trim()} {...rest}>
        {children}
      </Tag>
    )
  }
}

/** 28/34 — hero headlines. Anek, bold. */
export const Display = make('h1', 'font-display text-display font-bold text-text')

/** 22/28 — screen titles. Anek, semibold. */
export const H1 = make('h1', 'font-display text-h1 font-bold text-text')

/** 18/24 — section headers. Anek, semibold. */
export const H2 = make('h2', 'font-display text-h2 font-semibold text-text')

/** 16/24 — default body copy. Hind. */
export const Body = make('p', 'font-body text-body text-text')

/** 14/20 — secondary copy / labels. Hind, muted by default. */
export const Small = make('p', 'font-body text-small text-text-mute')

/** 12/16 — micro labels (eyebrows, captions). Never used for content. */
export const Micro = make('span', 'font-body text-micro text-text-mute')

/**
 * Numerals / amounts / timestamps — Spline Sans Mono with tabular figures.
 * Use for money, counts, dates and times so digits align.
 */
export const Mono = make('span', 'cstk-mono text-text')
