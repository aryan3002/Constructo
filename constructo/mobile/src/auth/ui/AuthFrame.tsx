/**
 * AuthFrame — the one scaffold every signed-out screen sits in.
 *
 *   ┌ ←  [logo]            EN|हिं  (?) ┐   header: back · mark · language · guide
 *   │ ●●○  Step 1 of 2                  │   optional step row (dots + words)
 *   │ Title                             │
 *   │ subtitle                          │
 *   │ …children…                        │
 *   │ footer (the cross-link)           │
 *   └───────────────────────────────────┘
 *
 * Theme-agnostic: reads whichever ThemeProvider wraps it (Daylight on the
 * front door / homeowner screens, Neev on the builder login). Owns the
 * GuideSheet so every screen gets "What's what" for free; screens that need to
 * open it to a specific section use the `guide` handle from `useAuthGuide`.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { SPACE, TAP } from '../../theme/tokens'
import { Display, FadeInUp, Logo, Screen, Small } from '../../ui'
import type { GuideSectionId } from '../guide.content'
import { GuideSheet } from './GuideSheet'
import { LangToggle } from './LangToggle'
import { StepDots } from './StepDots'

interface GuideHandle {
  open: (section?: GuideSectionId) => void
}

const GuideContext = createContext<GuideHandle | null>(null)

/** Open the frame's GuideSheet from anywhere inside an AuthFrame. */
export function useAuthGuide(): GuideHandle {
  const ctx = useContext(GuideContext)
  if (!ctx) throw new Error('useAuthGuide must be used inside <AuthFrame>')
  return ctx
}

export interface AuthFrameProps {
  title: string
  subtitle?: ReactNode
  /** `true` = router.back() (falls back to the front door); a function = custom. */
  back?: boolean | (() => void)
  step?: { n: number; total: number }
  footer?: ReactNode
  /** Which section the header `?` opens to (default: the top). */
  guideSection?: GuideSectionId
  /** Eczar headline even on Neev (one onboarding type voice). */
  serifTitle?: boolean
  children: ReactNode
}

export function AuthFrame({
  title,
  subtitle,
  back,
  step,
  footer,
  guideSection,
  serifTitle,
  children,
}: AuthFrameProps) {
  const { t } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const [guide, setGuide] = useState<{ open: boolean; section?: GuideSectionId }>({ open: false })

  const handle = useMemo<GuideHandle>(
    () => ({ open: (section) => setGuide({ open: true, section: section ?? guideSection }) }),
    [guideSection],
  )

  function goBack() {
    if (typeof back === 'function') return back()
    if (router.canGoBack()) router.back()
    else router.replace('/(auth)')
  }

  const iconBtn = {
    width: TAP,
    height: TAP,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: TAP / 2,
  }

  return (
    <GuideContext.Provider value={handle}>
      <Screen>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={goBack}
              style={({ pressed }) => [iconBtn, { marginLeft: -SPACE.sm, opacity: pressed ? 0.6 : 1 }]}
            >
              <Feather name="arrow-left" size={24} color={c.text} />
            </Pressable>
          ) : null}
          <Logo size={40} />
          <View style={{ flex: 1 }} />
          <LangToggle />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.help')}
            onPress={() => handle.open()}
            style={({ pressed }) => [
              iconBtn,
              { backgroundColor: c.card, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="help-circle" size={22} color={c.text} />
          </Pressable>
        </View>

        {/* Step + title block */}
        <FadeInUp duration={240} style={{ marginTop: SPACE.lg, gap: SPACE.sm }}>
          {step ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <StepDots n={step.n} total={step.total} />
              <Small muted>{t('auth.stepOf', { n: step.n, total: step.total })}</Small>
            </View>
          ) : null}
          <Display
            accessibilityRole="header"
            style={serifTitle ? { fontFamily: 'Eczar-SemiBold', lineHeight: 44 } : undefined}
          >
            {title}
          </Display>
          {typeof subtitle === 'string' ? <Small muted>{subtitle}</Small> : subtitle}
        </FadeInUp>

        <View style={{ marginTop: SPACE.lg, gap: SPACE.md }}>{children}</View>

        {footer ? (
          <View style={{ marginTop: SPACE.xl, alignItems: 'center', minHeight: TAP, justifyContent: 'center' }}>
            {footer}
          </View>
        ) : null}

        <GuideSheet
          open={guide.open}
          initialSection={guide.section}
          onClose={() => setGuide({ open: false })}
        />
      </Screen>
    </GuideContext.Provider>
  )
}
