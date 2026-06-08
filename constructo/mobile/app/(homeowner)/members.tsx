/**
 * Members — the household roster on the Calm Cockpit foundation (handoff §5).
 *
 * A calm household roster: each member is a warm card with a clay role kicker
 * (`Eyebrow`), the person's name, and a one-line *capability* sentence saying
 * what they CAN do. Graceful authority is the rule — we NEVER render a grey
 * lock or a "you can't" message. A non-owner simply sees their own capabilities
 * stated positively; the primary/co-owner additionally sees a calm "Manage
 * household" affordance (which lives in household.tsx).
 *
 * Invited-but-not-joined members carry a calm `StatusPill` (quiet tone — a soft
 * clock, never red, never an alarm). Empty/loading resolve to the reassuring
 * `QuietState`, not a blank or "0 members".
 *
 * Reads `capabilities()` (viewer authority) + `roster()` (the people). Pushed
 * screen (`href:null` in _layout) → `Screen floatingNav` reserves bottom room
 * for the floating bar + Ask pill (handoff §2.6). Feather icons, no emoji, no %,
 * warm-sand tokens only. Strings in the per-screen en/hi pattern.
 */
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { homeowner } from '../../src/api/client'
import type { Capabilities, HomeownerMember } from '../../src/api/types'
import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../src/theme/tokens'
import {
  Avatar,
  Body,
  BodyLg,
  BodyStrong,
  Button,
  Card,
  Display,
  Eyebrow,
  FadeInUp,
  Micro,
  QuietState,
  Screen,
  StatusPill,
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
    eyebrow: 'Household',
    subtitle: 'Everyone following this home, and what each person can do.',
    you: 'You',
    invited: 'Invited',
    invitedFull: 'Invited, not yet joined',
    manage: 'Manage household',
    emptyTitle: 'Just you, for now',
    emptyBody: 'No one else is following this home yet. Add family or an advisor when you’re ready.',
    rosterEyebrow: 'The people on this home',
    loadingTitle: 'Gathering your household…',
  },
  hi: {
    title: 'सदस्य',
    eyebrow: 'परिवार',
    subtitle: 'इस घर से जुड़े सभी लोग, और हर कोई क्या कर सकता है।',
    you: 'आप',
    invited: 'आमंत्रित',
    invitedFull: 'आमंत्रित, अभी शामिल नहीं',
    manage: 'परिवार संभालें',
    emptyTitle: 'अभी सिर्फ़ आप',
    emptyBody: 'इस घर से अभी कोई और नहीं जुड़ा। तैयार हों तो परिवार या सलाहकार जोड़ें।',
    rosterEyebrow: 'इस घर के लोग',
    loadingTitle: 'आपका परिवार जुटाया जा रहा है…',
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
      {/* ---- Calm header: clay kicker + serif title + reassuring line. ---- */}
      <FadeInUp style={{ gap: SPACE.xs }}>
        <Eyebrow>{tx.eyebrow}</Eyebrow>
        <Display accessibilityRole="header">{tx.title}</Display>
        <BodyLg muted>{tx.subtitle}</BodyLg>
      </FadeInUp>

      {rosterQ.isLoading ? (
        // Loading never blocks a blank screen — a calm, on-track reassurance.
        <QuietState icon="users" tone="ontrack" title={tx.loadingTitle} message="" />
      ) : members.length === 0 ? (
        // Empty is designed, framed as reassurance — never "0 members".
        <QuietState
          icon="home"
          tone="ontrack"
          title={tx.emptyTitle}
          message={tx.emptyBody}
        />
      ) : (
        <FadeInUp delay={40} style={{ gap: SPACE.sm }}>
          <Eyebrow style={{ color: theme.colors.textMute }}>{tx.rosterEyebrow}</Eyebrow>
          {members.map((m, i) => (
            <FadeInUp key={m.id} delay={60 + i * 30}>
              <MemberCard
                member={m}
                lang={L}
                // The caller's own membership (members()[0] convention) is hard
                // to match to roster rows; use user_id when present.
                isYou={Boolean(m.user_id && me?.id && m.user_id === me.id)}
                tx={tx}
                theme={theme}
              />
            </FadeInUp>
          ))}
        </FadeInUp>
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
  const cap = capabilityLine(member.sub_role, lang)
  const design = designLine(member, lang)

  return (
    <Card
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: SPACE.md,
        // A warm sage edge marks "you" — a gentle cue, never a hard outline.
        borderLeftWidth: isYou ? 3 : 1,
        borderLeftColor: isYou ? theme.colors.accent : theme.colors.line,
      }}
    >
      {/* Avatar pebble — shared kit component (initial or a calm user glyph). */}
      <Avatar name={member.display_name} />

      <View style={{ flex: 1, gap: SPACE.xs }}>
        {/* Clay role kicker — the named role, sentence above the name. */}
        <Eyebrow>{subRoleLabel(member.sub_role, lang)}</Eyebrow>

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
              <Micro style={{ color: AP.onChip, fontWeight: '600' }}>{tx.you}</Micro>
            </View>
          ) : null}
        </View>

        {/* The positive capability line — graceful authority, never a lock. */}
        <Body muted>{cap}</Body>
        {design ? <Body muted>{design}</Body> : null}

        {/* Invited-but-not-joined: a calm quiet-tone pill (clock, never red). */}
        {isInvited ? (
          <StatusPill
            status="quiet"
            label={tx.invited}
            size="sm"
            icon="clock"
            style={{ marginTop: 2 }}
          />
        ) : null}
      </View>
    </Card>
  )
}
