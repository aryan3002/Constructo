import type { ReactNode } from 'react'
import {
  CheckCircleIcon,
  InfoSquareIcon,
  RiskOctagonIcon,
  WarnTriangleIcon,
} from './icons'

/** Canonical status spine used across the kit. */
export type Status = 'ok' | 'warn' | 'risk' | 'info'

interface StatusMeta {
  label: string
  Icon: (props: { title?: string }) => ReactNode
  /** Text/icon color class. */
  fg: string
  /** Soft tinted background + border for the pill. */
  chip: string
  /** Solid swatch color for dots. */
  dot: string
}

export const STATUS_META: Record<Status, StatusMeta> = {
  ok: {
    label: 'On track',
    Icon: CheckCircleIcon,
    fg: 'text-ok',
    chip: 'bg-ok/10 border-ok/30 text-ok',
    dot: 'bg-ok',
  },
  warn: {
    label: 'Needs attention',
    Icon: WarnTriangleIcon,
    fg: 'text-warn',
    chip: 'bg-warn/10 border-warn/30 text-warn',
    dot: 'bg-warn',
  },
  risk: {
    label: 'At risk',
    Icon: RiskOctagonIcon,
    fg: 'text-risk',
    chip: 'bg-risk/10 border-risk/30 text-risk',
    dot: 'bg-risk',
  },
  info: {
    label: 'Info',
    Icon: InfoSquareIcon,
    fg: 'text-info',
    chip: 'bg-info/10 border-info/30 text-info',
    dot: 'bg-info',
  },
}

export interface StatusPillProps {
  status: Status
  /** Override the default label text. */
  label?: ReactNode
  /** Compact: icon + smaller padding. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * StatusPill — color + a DISTINCT icon shape + a text label. Never color alone.
 */
export function StatusPill({
  status,
  label,
  size = 'md',
  className,
}: StatusPillProps) {
  const meta = STATUS_META[status]
  const pad = size === 'sm' ? 'px-2 py-0.5 text-micro' : 'px-2.5 py-1 text-small'
  return (
    <span
      data-status={status}
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-pill border font-body font-semibold ${meta.chip} ${pad} ${
        className ?? ''
      }`.trim()}
    >
      <span className={`text-[1.05em] leading-none ${meta.fg}`}>
        <meta.Icon title={meta.label} />
      </span>
      <span>{label ?? meta.label}</span>
    </span>
  )
}

/**
 * StatusDot — a solid swatch paired with an accessible label (sr-only) and a
 * subtle ring shape so it's distinguishable without color. Used in lists where
 * a full pill is too heavy (e.g. SiteSwitcher rows).
 */
export function StatusDot({
  status,
  className,
}: {
  status: Status
  className?: string
}) {
  const meta = STATUS_META[status]
  return (
    <span
      role="img"
      aria-label={meta.label}
      data-status={status}
      className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-card ${meta.dot} ${
        className ?? ''
      }`.trim()}
    />
  )
}

/** Map the backend RiskSeverity (high/med/low) onto the status spine. */
export function severityToStatus(severity: string): Status {
  switch (severity) {
    case 'high':
      return 'risk'
    case 'med':
      return 'warn'
    case 'low':
      return 'info'
    default:
      return 'info'
  }
}
