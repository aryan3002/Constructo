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
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../src/theme/tokens'
import { Body, BodyStrong, Button, CalmCard, Card, Display, Micro, Screen, Small } from '../../src/ui'

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

  return (
    <Screen floatingNav>
      {/* Brand eyebrow + a soft Calm-Pine welcome mark. */}
      <View style={{ marginTop: SPACE.xl, gap: SPACE.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Feather name="home" size={16} color={theme.colors.accent} />
          <Micro style={{ letterSpacing: 2, color: theme.colors.textMute }}>CONSTRUCTO</Micro>
        </View>

        {/* Templated-truth greeting — honest metadata only (property + inviter). */}
        <View style={{ gap: SPACE.sm }}>
          <Display>
            {L === 'hi' ? 'स्वागत है' : 'Welcome'}
            {displayName ? ` — ${displayName}` : ''}
          </Display>
          {companyName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="briefcase" size={14} color={theme.colors.textMute} />
              <Small muted>
                {L === 'hi' ? `${companyName} द्वारा आमंत्रित` : `Invited by ${companyName}`}
              </Small>
            </View>
          ) : null}
        </View>

        {/* Role chip — icon + word (never color alone). */}
        <View
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: theme.radii.pill,
            backgroundColor: AP.chip,
            paddingHorizontal: SPACE.md,
            paddingVertical: SPACE.xs + 2,
          }}
        >
          <Feather name={roleIcon} size={14} color={AP.onChip} />
          <Small style={{ color: AP.onChip, fontWeight: '600' }}>{roleLabel}</Small>
        </View>
      </View>

      {/* Role-specific reassurance — a calm pine-bordered card. */}
      <CalmCard title={roleCopy.tagline} body={roleCopy.body} status="ok" />

      {/* Quiet-period / empty-state reassurance (L3) — soft inset, never alarming. */}
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

      {/* CTA */}
      <View style={{ gap: SPACE.md, marginTop: SPACE.sm }}>
        <Button
          title={ctaLabel}
          block
          size="lg"
          onPress={onContinue}
          leading={<Feather name={ctaIcon} size={18} color={theme.colors.onAccent} />}
        />
        {isOwner && (
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel={skipLabel}
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
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
