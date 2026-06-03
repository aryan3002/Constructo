/**
 * Members — the household roster with graceful authority (handoff §5).
 *
 * Every member is shown with their name, a named role label, and a one-line
 * *capability* sentence describing what they CAN do (e.g. "Can approve costs",
 * "Can comment + suggest design"). We NEVER render a grey lock or a "you can't"
 * message — a non-owner sees their own capabilities stated positively; the
 * primary/co-owner additionally sees manage affordances.
 *
 * Reads `capabilities()` (viewer authority) + `roster()` (the people). Add /
 * remove / change-role live in the existing household.tsx — managers get a
 * "Manage household" button that pushes there rather than duplicating the form.
 *
 * Pushed screen (declared `href:null` in _layout). Feather icons, no emoji,
 * no %, warm-paper tokens. Strings in the per-screen en/hi pattern.
 */
import { ActivityIndicator, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { homeowner } from '../../src/api/client'
import type { Capabilities, HomeownerMember } from '../../src/api/types'
import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Display,
  Micro,
  Screen,
  Small,
} from '../../src/ui'
import {
  canManage,
  capabilityLine,
  designLine,
  subRoleLabel,
  type Lang,
} from './_settings.util'

const STR = {
  en: {
    title: 'Members',
    subtitle: 'Everyone following this home, and what each person can do.',
    you: 'You',
    invited: 'Invited, not yet joined',
    manage: 'Manage household',
    empty: 'No members yet.',
    rosterEyebrow: 'HOUSEHOLD',
  },
  hi: {
    title: 'सदस्य',
    subtitle: 'इस घर से जुड़े सभी लोग, और हर कोई क्या कर सकता है।',
    you: 'आप',
    invited: 'आमंत्रित, अभी शामिल नहीं',
    manage: 'परिवार संभालें',
    empty: 'अभी कोई सदस्य नहीं।',
    rosterEyebrow: 'परिवार',
  },
} as const

export default function Members() {
  const { lang } = useT()
  const { theme } = useTheme()
  const { siteId, me } = useAuth()
  const router = useRouter()
  const L: Lang = lang === 'hi' ? 'hi' : 'en'
  const tx = STR[L]

  const capsQ = useQuery({
    queryKey: ['homeowner-capabilities', siteId],
    queryFn: () => homeowner.capabilities(siteId ?? undefined),
  })
  const rosterQ = useQuery({
    queryKey: ['household-roster', siteId],
    queryFn: () => homeowner.roster(siteId ?? undefined),
  })

  const caps: Capabilities | undefined = capsQ.data
  const members: HomeownerMember[] = rosterQ.data ?? []
  const viewerCanManage = canManage(caps)

  return (
    <Screen floatingNav>
      <View style={{ gap: SPACE.sm }}>
        <Display>{tx.title}</Display>
        <Small muted>{tx.subtitle}</Small>
      </View>

      {rosterQ.isLoading ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : members.length === 0 ? (
        <Small muted>{tx.empty}</Small>
      ) : (
        <View style={{ gap: SPACE.sm }}>
          <Micro style={{ letterSpacing: 2, color: theme.colors.textMute }}>
            {tx.rosterEyebrow}
          </Micro>
          {members.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              lang={L}
              // The caller's own membership (members()[0] convention) is hard to
              // match to roster rows; use user_id when present.
              isYou={Boolean(m.user_id && me?.id && m.user_id === me.id)}
              tx={tx}
              theme={theme}
            />
          ))}
        </View>
      )}

      {/* Graceful authority: managers get the add/manage affordance (which lives
          in household.tsx). Non-managers simply don't see it — never a lock. */}
      {viewerCanManage ? (
        <Button
          title={tx.manage}
          block
          variant="secondary"
          onPress={() => router.push('/(homeowner)/household')}
        />
      ) : null}
    </Screen>
  )
}

function MemberCard({
  member,
  lang,
  isYou,
  tx,
  theme,
}: {
  member: HomeownerMember
  lang: Lang
  isYou: boolean
  tx: (typeof STR)[Lang]
  theme: ReturnType<typeof useTheme>['theme']
}) {
  const isInvited = member.status === 'invited'
  const name = member.display_name ?? member.phone ?? '—'
  // Initial avatar when we have a real name (not a phone/dash fallback) — the
  // first letter, uppercased. `\p{L}` keeps it to letters (incl. Devanagari),
  // so a phone like "+9198…" falls back to the generic icon.
  const initial = member.display_name?.trim()?.[0]?.toUpperCase()
  const showInitial = Boolean(initial && /\p{L}/u.test(initial))
  const cap = capabilityLine(member.sub_role, lang)
  const design = designLine(member, lang)

  return (
    <Card
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: SPACE.md,
        borderLeftWidth: isYou ? 3 : 0,
        borderLeftColor: isYou ? theme.colors.accent : 'transparent',
      }}
    >
      {/* Avatar chip */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: theme.radii.pill,
          backgroundColor: AP.chip,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {showInitial ? (
          <BodyStrong color={theme.colors.accentDeep}>{initial}</BodyStrong>
        ) : (
          <Feather name="user" size={18} color={theme.colors.accentDeep} />
        )}
      </View>

      <View style={{ flex: 1, gap: SPACE.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <BodyStrong numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </BodyStrong>
          {isYou ? (
            <View
              style={{
                backgroundColor: AP.chip,
                borderRadius: theme.radii.pill,
                paddingHorizontal: SPACE.sm,
                paddingVertical: 2,
              }}
            >
              <Micro style={{ color: AP.onChip }}>{tx.you}</Micro>
            </View>
          ) : null}
        </View>

        <Small style={{ color: theme.colors.accentDeep }}>
          {subRoleLabel(member.sub_role, lang)}
        </Small>

        {/* The positive capability line — graceful authority, never a lock. */}
        <Body muted>{cap}</Body>
        {design ? <Small muted>{design}</Small> : null}

        {isInvited ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Feather name="clock" size={13} color={theme.colors.warn} />
            <Small style={{ color: theme.colors.warn }}>{tx.invited}</Small>
          </View>
        ) : null}
      </View>
    </Card>
  )
}
