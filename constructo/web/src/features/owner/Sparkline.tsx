// Tiny inline SVG sparkline — the ONLY chart primitive in the product, confined
// to Col-3 (This Week). No charting framework: a single polyline over a 0..max
// range, so it adds ~nothing to the bundle and is lazy-loaded as its own chunk
// (default export → React.lazy in ThisWeek). Static (no animation), with an
// aria summary so screen readers get the trend, not an empty graphic.
interface SparklineProps {
  values: number[]
  /** Accessible one-line summary, e.g. "Cash in, 7-day trend". */
  label: string
  /** Status spine tint for the stroke. */
  tone?: 'ok' | 'warn' | 'risk' | 'info'
  width?: number
  height?: number
}

const TONE_STROKE: Record<NonNullable<SparklineProps['tone']>, string> = {
  ok: 'var(--c-ok)',
  warn: 'var(--c-warn)',
  risk: 'var(--c-risk)',
  info: 'var(--c-info)',
}

export default function Sparkline({
  values,
  label,
  tone = 'info',
  width = 96,
  height = 28,
}: SparklineProps) {
  const n = values.length
  const max = Math.max(1, ...values)
  const stroke = TONE_STROKE[tone]

  // Map each value to an (x, y) within the box (1px padding for stroke width).
  const pad = 2
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const points = values.map((v, i) => {
    const x = n <= 1 ? pad : pad + (i / (n - 1)) * innerW
    const y = pad + innerH - (v / max) * innerH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const hasData = values.some((v) => v > 0)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className="overflow-visible"
    >
      {hasData ? (
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={stroke}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        // Flat baseline when there is nothing to plot — honest, not a fake curve.
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke="var(--c-line)"
          strokeWidth={1.5}
          strokeDasharray="2 3"
        />
      )}
    </svg>
  )
}
