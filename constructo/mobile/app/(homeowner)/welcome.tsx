/**
 * Homeowner Welcome — templated truth, zero AI (A1/A2 doctrine).
 *
 * Shown immediately after join.tsx succeeds. Renders:
 *   "Welcome to <display_name> — invited by <company_name> as <sub_role label>"
 *
 * Routing on Continue:
 *   primary_owner / co_owner → /(homeowner)/household  (can seed the family)
 *   family                   → /(homeowner)/home
 *   advisor                  → /(homeowner)/design
 *
 * Parameters come from join.tsx via router params (from JoinOut).
 * Falls back gracefully when display_name / company_name are absent
 * (JoinOut extension not yet deployed on backend).
 *
 * Calm Cockpit: the greeting is TEMPLATED TRUTH — honest metadata only
 * (property + "invited by"). Never an AI-generated/embellished line. Premium
 * Feather icons, Calm-Pine accents, warm paper. Strings stay in the per-screen
 * en/hi pattern (NOT the i18n catalog — founder's WIP).
 */
import { Pressable, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'

import type { HomeownerSubRole } from '../../src/api/types'
import { roleTour } from '../../src/auth/guide.content'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE, type Status } from '../../src/theme/tokens'
import {
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Display,
  Eyebrow,
  FadeInUp,
  Screen,
  Small,
  StatusPill,
} from '../../src/ui'

const ROLE_LABEL: Record<HomeownerSubRole, { en: string; hi: string }> = {
  primary_owner: { en: 'Primary Owner', hi: 'मुख्य मालिक' },
  co_owner: { en: 'Co-owner', hi: 'सह-मालिक' },
  family: { en: 'Family Member', hi: 'परिवार सदस्य' },
  advisor: { en: 'Advisor', hi: 'सलाहकार' },
}

/** A premium Feather glyph per role — a shape cue beside the role label. */
const ROLE_ICON: Record<HomeownerSubRole, React.ComponentProps<typeof Feather>['name']> = {
  primary_owner: 'home',
  co_owner: 'home',
  family: 'users',
  advisor: 'feather',
}

/** Status tone behind the role pill — calm sage for owners (on track), neutral
 *  quiet grey for view/advise roles (never alarming). Keeps the "status =
 *  colour + icon + word" rule even on a role chip. Red is never used here. */
const ROLE_TONE: Record<HomeownerSubRole, Status> = {
  primary_owner: 'ok',
  co_owner: 'ok',
  family: 'quiet',
  advisor: 'quiet',
}

const ROLE_COPY: Record<
  HomeownerSubRole,
  { en: { tagline: string; body: string }; hi: { tagline: string; body: string } }
> = {
  primary_owner: {
    en: {
      tagline: 'Your home, your decisions.',
      body: 'You can approve costs, track every change, and invite family to stay in the loop.',
    },
    hi: {
      tagline: 'आपका घर, आपके फ़ैसले।',
      body: 'आप खर्च मंज़ूर कर सकते हैं, हर बदलाव देख सकते हैं, और परिवार को जोड़ सकते हैं।',
    },
  },
  co_owner: {
    en: {
      tagline: 'You share ownership.',
      body: 'You can approve costs and add family members alongside the primary owner.',
    },
    hi: {
      tagline: 'आप सह-मालिक हैं।',
      body: 'आप खर्च मंज़ूर कर सकते हैं और परिवार सदस्यों को जोड़ सकते हैं।',
    },
  },
  family: {
    en: {
      tagline: 'You can view, flag a worry, and comment.',
      body: "This home is being built with you in mind — you're never out of the loop.",
    },
    hi: {
      tagline: 'आप देख सकते हैं, चिंता जता सकते हैं, और टिप्पणी कर सकते हैं।',
      body: 'यह घर आपको ध्यान में रखकर बन रहा है — आप हमेशा जुड़े रहेंगे।',
    },
  },
  advisor: {
    en: {
      tagline: 'You advise on design — view & comment.',
      body: "Your taste matters. You'll see the design choices and can share your perspective anytime.",
    },
    hi: {
      tagline: 'आप डिज़ाइन पर सलाह देते हैं — देखें और टिप्पणी करें।',
      body: 'आपकी पसंद मायने रखती है। आप डिज़ाइन विकल्प देख सकते हैं और कभी भी अपनी राय साझा कर सकते हैं।',
    },
  },
}

export default function Welcome() {
  const { lang } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams<{
    sub_role?: string
    site_id?: string
    display_name?: string
    company_name?: string
  }>()

  const L = lang === 'hi' ? 'hi' : 'en'
  const subRole = (params.sub_role ?? 'primary_owner') as HomeownerSubRole
  const isOwner = subRole === 'primary_owner' || subRole === 'co_owner'

  const displayName = params.display_name || null
  const companyName = params.company_name || null
  const roleLabel = ROLE_LABEL[subRole]?.[L] ?? ROLE_LABEL.primary_owner[L]
  const roleIcon = ROLE_ICON[subRole] ?? ROLE_ICON.primary_owner
  const roleTone = ROLE_TONE[subRole] ?? ROLE_TONE.primary_owner
  const roleCopy = ROLE_COPY[subRole]?.[L] ?? ROLE_COPY.primary_owner[L]

  const ctaLabel = isOwner
    ? L === 'hi'
      ? 'परिवार जोड़ें'
      : 'Add family members'
    : L === 'hi'
      ? 'घर देखें'
      : 'Go to my home'
  const ctaIcon: React.ComponentProps<typeof Feather>['name'] = isOwner ? 'user-plus' : 'arrow-right'

  function onContinue() {
    if (isOwner) {
      router.replace('/(homeowner)/household')
    } else if (subRole === 'advisor') {
      router.replace('/(homeowner)/design')
    } else {
      router.replace('/(homeowner)/home')
    }
  }

  const skipLabel = L === 'hi' ? 'अभी छोड़ें' : 'Skip for now'

  function onSkip() {
    router.replace('/(homeowner)/home')
  }

  // The welcome moment is a warm CELEBRATION for owners who are about to seed
  // their family (clay `celebrate`); a calm Calm-Pine "go to my home" for the
  // view/advise roles. Clay is reserved for this one warm confirm — never alarm.
  const ctaVariant = isOwner ? 'celebrate' : 'primary'
  const ctaFg = isOwner ? '#ffffff' : theme.colors.onAccent

  return (
    <Screen floatingNav>
      {/* Calm serif greeting on warm sand — templated truth, never hype. */}
      <FadeInUp style={{ marginTop: SPACE.lg, gap: SPACE.lg }}>
        {/* Clay eyebrow kicker — the one place we go uppercase. */}
        <Eyebrow>{L === 'hi' ? 'स्वागत है' : 'Welcome'}</Eyebrow>

        {/* Templated-truth greeting — honest metadata only (property + inviter). */}
        <View style={{ gap: SPACE.sm }}>
          <Display>{displayName ? displayName : L === 'hi' ? 'आपका नया घर' : 'Your new home'}</Display>
          {companyName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="briefcase" size={14} color={theme.colors.textMute} />
              <Small muted>
                {L === 'hi' ? `${companyName} द्वारा आमंत्रित` : `Invited by ${companyName}`}
              </Small>
            </View>
          ) : null}
        </View>

        {/* Role chip — status = colour + icon + word (never colour alone). */}
        <StatusPill status={roleTone} icon={roleIcon} label={roleLabel} />
      </FadeInUp>

      {/* Role-specific reassurance — "here's what we'll do for you," framed as
          templated truth on a calm pine-bordered card. */}
      <FadeInUp delay={40}>
        <CalmCard title={roleCopy.tagline} body={roleCopy.body} status="ok" />
      </FadeInUp>

      {/* Quiet-period / empty-state reassurance (L3) — soft inset, never alarming. */}
      <FadeInUp delay={80}>
        <Card style={{ backgroundColor: AP.surfaceLow, borderColor: theme.colors.line }}>
          <View style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' }}>
            <Feather name="clock" size={16} color={theme.colors.quiet} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: SPACE.xs }}>
              <BodyStrong>{L === 'hi' ? 'अभी सब शांत है' : 'All calm for now'}</BodyStrong>
              <Small muted>
                {L === 'hi'
                  ? 'आपका बिल्डर यहाँ अपडेट शेयर करना शुरू करेगा — हम शांत दौर समझाएँगे ताकि आप कभी अनजान न रहें।'
                  : "Your builder will start sharing updates here — we'll explain quiet stretches so you're never left wondering."}
              </Small>
            </View>
          </View>
        </Card>
      </FadeInUp>

      {/* "What's what" — the tab bar they're about to see, explained once.
          Icon + name + one plain line each (templated truth, no hype). */}
      <FadeInUp delay={120}>
        <View style={{ gap: SPACE.sm }}>
          <Eyebrow>{L === 'hi' ? 'यहाँ क्या क्या है' : "Here's what's what"}</Eyebrow>
          <Card style={{ paddingVertical: SPACE.xs }}>
            {roleTour('homeowner', L).map((row, i) => (
              <View
                key={row.title}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.md,
                  paddingVertical: SPACE.md,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: theme.colors.line,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: theme.colors.accentWarm,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name={row.icon} size={18} color={theme.colors.accentDeep} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <BodyStrong>{row.title}</BodyStrong>
                  <Small muted>{row.body}</Small>
                </View>
              </View>
            ))}
          </Card>
        </View>
      </FadeInUp>

      {/* CTA — one warm primary action. */}
      <View style={{ gap: SPACE.md, marginTop: SPACE.sm }}>
        <Button
          title={ctaLabel}
          variant={ctaVariant}
          block
          size="lg"
          onPress={onContinue}
          leading={<Feather name={ctaIcon} size={18} color={ctaFg} />}
        />
        {isOwner && (
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel={skipLabel}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            {/* A quiet dismiss link, not a bold ghost button — keeps the primary
                CTA above it visually dominant (calmer hierarchy). */}
            <Small muted>{skipLabel}</Small>
          </Pressable>
        )}
      </View>
    </Screen>
  )
}
