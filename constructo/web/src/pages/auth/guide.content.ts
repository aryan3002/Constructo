// "What's what" — the one scrollable reference reachable from every signed-out
// screen (spec §3 layer 2, §5.1 GuideSheet). Same six sections as mobile; copy
// lives in the i18n catalogs (EN/HI) so the text is identical on both clients.
import type { SVGProps } from 'react'
import type { TranslationKey } from '../../i18n'
import {
  BuildingIcon,
  InfoSquareIcon,
  LockIcon,
  MessageIcon,
  ShieldIcon,
  UsersIcon,
} from '../../ui/icons'

export type GuideSectionId = 'doors' | 'joinCode' | 'otp' | 'roles' | 'notEnabled' | 'privacy'

export const GUIDE_SECTION_IDS: readonly GuideSectionId[] = [
  'doors',
  'joinCode',
  'otp',
  'roles',
  'notEnabled',
  'privacy',
]

export interface GuideSection {
  id: GuideSectionId
  icon: (p: SVGProps<SVGSVGElement>) => JSX.Element
  titleKey: TranslationKey
  /** One paragraph / bullet per key, rendered in order. */
  bodyKeys: TranslationKey[]
}

/**
 * The six sections in reading order. `dev` appends the demo-code hint to the
 * one-time-code section — it must never appear in a production build.
 */
export function guideSections(opts: { dev: boolean }): GuideSection[] {
  return [
    {
      id: 'doors',
      icon: BuildingIcon,
      titleKey: 'auth.guide.doors.title',
      bodyKeys: ['auth.guide.doors.body1', 'auth.guide.doors.body2'],
    },
    {
      id: 'joinCode',
      icon: MessageIcon,
      titleKey: 'auth.guide.join_code.title',
      bodyKeys: [
        'auth.guide.join_code.body1',
        'auth.guide.join_code.body2',
        'auth.guide.join_code.body3',
      ],
    },
    {
      id: 'otp',
      icon: LockIcon,
      titleKey: 'auth.guide.otp.title',
      bodyKeys: [
        'auth.guide.otp.body1',
        'auth.guide.otp.body2',
        ...(opts.dev ? (['auth.guide.otp.dev'] as TranslationKey[]) : []),
      ],
    },
    {
      id: 'roles',
      icon: UsersIcon,
      titleKey: 'auth.guide.roles.title',
      bodyKeys: [
        'auth.guide.roles.owner',
        'auth.guide.roles.pm',
        'auth.guide.roles.supervisor',
        'auth.guide.roles.accountant',
        'auth.guide.roles.mukadam',
        'auth.guide.roles.architect',
        'auth.guide.roles.homeowner',
      ],
    },
    {
      id: 'notEnabled',
      icon: InfoSquareIcon,
      titleKey: 'auth.guide.not_enabled.title',
      bodyKeys: ['auth.guide.not_enabled.body1', 'auth.guide.not_enabled.body2'],
    },
    {
      id: 'privacy',
      icon: ShieldIcon,
      titleKey: 'auth.guide.privacy.title',
      bodyKeys: ['auth.guide.privacy.body1'],
    },
  ]
}

/** DOM id for a section inside the guide dialog (used to jump to it). */
export function guideSectionDomId(id: GuideSectionId): string {
  return `auth-guide-${id}`
}
