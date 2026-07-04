import type { ReactNode } from 'react'
import {
  CheckCircleIcon,
  InfoSquareIcon,
  RiskOctagonIcon,
  WarnTriangleIcon,
  LockIcon,
} from './icons'

/** Canonical status spine used across the kit. 'done' = calm locked/released state. */
export type Status = 'ok' | 'warn' | 'risk' | 'info' | 'done'

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
  done: {
    label: 'Done',
    Icon: LockIcon,
    fg: 'text-done',
    chip: 'bg-done-bg border-done-fg/20 text-done-fg',
    dot: 'bg-done',
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
  const meta = STATUS_META[status] ?? STATUS_META.info
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
  const meta = STATUS_META[status] ?? STATUS_META.info
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

/**
 * Map a backend Site lifecycle status (a free string: active / building /
 * completed / on_hold / planning / …) onto the canonical Status spine for a dot.
 * An already-canonical value passes through; unknown / null falls back to a
 * neutral 'info'. This must never throw — a raw site status flows straight into
 * <StatusDot> in the site switcher, and an unmapped value there blanked the page.
 */
export function siteStatusToStatus(raw: string | null | undefined): Status {
  if (raw && raw in STATUS_META) return raw as Status
  switch (raw) {
    case 'active':
    case 'building':
    case 'in_progress':
      return 'ok'
    case 'completed':
    case 'handover':
    case 'closed':
      return 'done'
    case 'on_hold':
    case 'paused':
    case 'blocked':
      return 'warn'
    default:
      return 'info'
  }
}
