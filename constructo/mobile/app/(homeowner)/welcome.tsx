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
 */
import { View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'

import type { HomeownerSubRole } from '../../src/api/types'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../src/theme/tokens'
import { Body, Button, Card, Display, Micro, Screen, Small } from '../../src/ui'

const ROLE_LABEL: Record<HomeownerSubRole, { en: string; hi: string }> = {
  primary_owner: { en: 'Primary Owner', hi: 'मुख्य मालिक' },
  co_owner: { en: 'Co-owner', hi: 'सह-मालिक' },
  family: { en: 'Family Member', hi: 'परिवार सदस्य' },
  advisor: { en: 'Advisor', hi: 'सलाहकार' },
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
  const roleCopy = ROLE_COPY[subRole]?.[L] ?? ROLE_COPY.primary_owner[L]

  const ctaLabel = isOwner
    ? L === 'hi'
      ? 'परिवार जोड़ें'
      : 'Add family members'
    : L === 'hi'
      ? 'घर देखें'
      : 'Go to my home'

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
    <Screen>
      {/* Header area */}
      <View style={{ marginTop: SPACE.xxl, gap: SPACE.sm }}>
        <Micro
          style={{ letterSpacing: 2, color: theme.colors.textMute }}
        >
          CONSTRUCTO
        </Micro>
        <Display>
          {L === 'hi' ? 'स्वागत है' : 'Welcome'}
          {displayName ? ` — ${displayName}` : ''}
        </Display>
        {companyName ? (
          <Small muted>
            {L === 'hi'
              ? `${companyName} द्वारा आमंत्रित`
              : `Invited by ${companyName}`}
          </Small>
        ) : null}
      </View>

      {/* Role chip */}
      <View
        style={{
          alignSelf: 'flex-start',
          borderRadius: theme.radii.pill,
          backgroundColor: AP.chip,
          paddingHorizontal: SPACE.md,
          paddingVertical: SPACE.xs,
        }}
      >
        <Small style={{ color: AP.onChip }}>{roleLabel}</Small>
      </View>

      {/* Role-specific copy card */}
      <Card style={{ gap: SPACE.sm, backgroundColor: theme.colors.card }}>
        <Body style={{ fontWeight: '700' }}>{roleCopy.tagline}</Body>
        <Body muted>{roleCopy.body}</Body>
      </Card>

      {/* Quiet period / empty state reassurance (L3) */}
      <Card
        style={{
          backgroundColor: AP.surfaceLow,
          borderWidth: 0,
          gap: SPACE.xs,
        }}
      >
        <Small muted>
          {L === 'hi'
            ? 'आपका बिल्डर यहाँ अपडेट शेयर करना शुरू करेगा — हम शांत दौर समझाएँगे ताकि आप कभी अनजान न रहें।'
            : "Your builder will start sharing updates here — we'll explain quiet stretches so you're never left wondering."}
        </Small>
      </Card>

      {/* CTA */}
      <View style={{ gap: SPACE.md, marginTop: SPACE.sm }}>
        <Button title={ctaLabel} block size="lg" onPress={onContinue} />
        {isOwner && (
          <Button title={skipLabel} block variant="ghost" onPress={onSkip} />
        )}
      </View>
    </Screen>
  )
}
