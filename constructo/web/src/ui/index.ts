// Constructo "Blueprint & Daylight" design system — public surface.
// Import components from '../ui' (or '@/ui') rather than deep paths.

export { ThemeProvider, ThemeSurface, useTheme } from './ThemeProvider'
export type { Theme } from './ThemeProvider'

export { Display, H1, H2, Body, Small, Micro, Mono } from './Typography'

export { Button } from './Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button'

export { StatusPill, StatusDot, STATUS_META, severityToStatus } from './StatusPill'
export type { Status, StatusPillProps } from './StatusPill'

export { EvidenceCard } from './EvidenceCard'
export type {
  EvidenceCardProps,
  EvidenceItem,
  EvidenceKind,
} from './EvidenceCard'

export { BriefCommandCard } from './BriefCommandCard'
export type {
  BriefCommandCardProps,
  BriefRisk,
  BriefAction,
} from './BriefCommandCard'

export { CaptureBar } from './CaptureBar'
export type { CaptureBarProps } from './CaptureBar'

export { ClarificationChip } from './ClarificationChip'
export type {
  ClarificationChipProps,
  ClarificationAnswer,
} from './ClarificationChip'

export { TimelineItem } from './TimelineItem'
export type { TimelineItemProps } from './TimelineItem'

export { SiteSwitcher } from './SiteSwitcher'
export type { SiteSummary, SiteSwitcherProps } from './SiteSwitcher'

export { AppShell, ROLE_TABS, useRoleTabs } from './AppShell'
export type { AppShellProps, Role, TabDef } from './AppShell'

export * as Icons from './icons'
