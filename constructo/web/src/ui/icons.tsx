import type { SVGProps } from 'react'

/**
 * Tiny inline icon set (no icon-font / no dependency). Every status icon has a
 * DISTINCT shape so status is never conveyed by color alone (a11y + the design
 * spec). `currentColor` is used so callers control color via text/SVG color.
 */

type IconProps = SVGProps<SVGSVGElement> & { title?: string }

function base({ title, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

/** OK — check inside circle. */
export const CheckCircleIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </>) })

/** Warn — triangle + bang. */
export const WarnTriangleIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M12 4 3 19h18L12 4Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
  </>) })

/** Risk — octagon + bang (stop sign). */
export const RiskOctagonIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5Z" />
    <path d="M12 8v4" />
    <circle cx="12" cy="15.5" r="0.6" fill="currentColor" stroke="none" />
  </>) })

/** Info — i inside square. */
export const InfoSquareIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
  </>) })

export const ChevronDownIcon = (p: IconProps) =>
  base({ ...p, children: <path d="m6 9 6 6 6-6" /> })

export const BellIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </>) })

export const CameraIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z" />
    <circle cx="12" cy="13" r="3.2" />
  </>) })

export const MicIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </>) })

export const PhotoIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.6" />
    <path d="m4 17 5-4 4 3 3-2 4 3" />
  </>) })

export const DocIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M7 3h7l4 4v14H7V3Z" />
    <path d="M13 3v5h5" />
    <path d="M9.5 13h6M9.5 16h6" />
  </>) })

export const MessageIcon = (p: IconProps) =>
  base({ ...p, children: <path d="M4 5h16v11H9l-5 4V5Z" /> })

export const CheckIcon = (p: IconProps) =>
  base({ ...p, children: <path d="m5 12 5 5 9-10" /> })

export const PauseIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <rect x="7" y="5" width="3.2" height="14" rx="1" />
    <rect x="13.8" y="5" width="3.2" height="14" rx="1" />
  </>) })

export const UserPlusIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M18 8v6M15 11h6" />
  </>) })

export const SearchIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-3.5-3.5" />
  </>) })

export const GridIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </>) })

export const ListIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
  </>) })

export const DotsIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </>) })

/** Currency / cash — Indian rupee symbol outline. */
export const CashIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M6 5h12M6 9h12M10 9l2 10M8 5a4 4 0 0 0 0 4h3a4 4 0 0 0 0-4" />
  </>) })

/** Settings — a simple gear / cog. */
export const SettingsIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </>) })

/** Sign out — arrow exiting a door. */
export const SignOutIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </>) })

/** Lock — padlock closed (distinct shape for the 'done' status tone). */
export const LockIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>) })

/** Reconcile — balance scale. */
export const ScaleIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M12 4v16M7 20h10" />
    <path d="M6 7h12M6 7l-2.5 5a2.5 2.5 0 0 0 5 0L6 7Zm12 0-2.5 5a2.5 2.5 0 0 0 5 0L18 7Z" />
  </>) })

/** Sites — building. */
export const BuildingIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <rect x="5" y="3" width="14" height="18" rx="1" />
    <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
  </>) })

/** Reports — bar chart. */
export const ChartBarIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M4 20h16" />
    <rect x="6" y="11" width="3" height="6" /><rect x="11" y="7" width="3" height="10" /><rect x="16" y="13" width="3" height="4" />
  </>) })

/** Permits — shield. */
export const ShieldIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </>) })

/** Admin / team — people. */
export const UsersIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5M21 20a6 6 0 0 0-4-5.7" />
  </>) })

/** Designer — compass / draftsman. */
export const CompassIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </>) })

/** Theme — sun. */
export const SunIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>) })

/** Theme — moon. */
export const MoonIcon = (p: IconProps) =>
  base({ ...p, children: <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" /> })

/** Theme — system (monitor). */
export const MonitorIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <rect x="3" y="4" width="18" height="12" rx="1" />
    <path d="M8 20h8M12 16v4" />
  </>) })

/** Collapse — panel-left. */
export const PanelLeftIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </>) })
