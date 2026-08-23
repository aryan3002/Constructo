/**
 * GuideSheet — the "What's what" reference, as a bottom sheet over any auth
 * screen. Six sections (doors · join code · one-time code · roles · not
 * enabled · privacy) from `guide.content.ts`; `initialSection` scrolls the
 * sheet straight to the part the user asked about ("Where do I find my code?").
 *
 * Plain RN Modal (no sheet library): slide-up + scrim, fade under Reduce
 * Motion, closable by the X, the scrim, and the hardware back.
 */
import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { SPACE, TAP } from '../../theme/tokens'
import { Body, H1, Small, Title, useReducedMotion } from '../../ui'
import { guideSections, type GuideSectionId } from '../guide.content'

export interface GuideSheetProps {
  open: boolean
  onClose: () => void
  initialSection?: GuideSectionId
}

export function GuideSheet({ open, onClose, initialSection }: GuideSheetProps) {
  const { t, lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const scroll = useRef<ScrollView>(null)
  const offsets = useRef<Partial<Record<GuideSectionId, number>>>({})
  const [ready, setReady] = useState(false)

  const sections = guideSections(lang, { dev: __DEV__ })

  // Once the sheet has laid out, jump to the requested section (no animation
  // under Reduce Motion; a short settle otherwise).
  useEffect(() => {
    if (!open || !ready || !initialSection) return
    const y = offsets.current[initialSection]
    if (y === undefined) return
    const id = setTimeout(
      () => scroll.current?.scrollTo({ y: Math.max(0, y - SPACE.md), animated: !reduced }),
      reduced ? 0 : 120,
    )
    return () => clearTimeout(id)
  }, [open, ready, initialSection, reduced])

  useEffect(() => {
    if (!open) setReady(false)
  }, [open])

  return (
    <Modal
      visible={open}
      transparent
      animationType={reduced ? 'fade' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Scrim — tap to dismiss */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(27,25,22,0.38)', justifyContent: 'flex-end' }}
      >
        {/* The sheet itself swallows taps */}
        <Pressable
          onPress={() => undefined}
          style={{
            maxHeight: '86%',
            backgroundColor: c.bg,
            borderTopLeftRadius: theme.radii.sheet,
            borderTopRightRadius: theme.radii.sheet,
            paddingBottom: insets.bottom + SPACE.lg,
          }}
        >
          {/* Grabber + header */}
          <View style={{ alignItems: 'center', paddingTop: SPACE.sm }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.line }} />
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: SPACE.lg,
              paddingTop: SPACE.md,
              paddingBottom: SPACE.sm,
            }}
          >
            <H1 style={{ flex: 1 }}>{t('auth.help')}</H1>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
              style={{
                width: TAP,
                height: TAP,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: TAP / 2,
                backgroundColor: c.paper,
              }}
            >
              <Feather name="x" size={20} color={c.text} />
            </Pressable>
          </View>

          <ScrollView
            ref={scroll}
            onLayout={() => setReady(true)}
            contentContainerStyle={{ paddingHorizontal: SPACE.lg, gap: SPACE.md, paddingBottom: SPACE.lg }}
            showsVerticalScrollIndicator={false}
          >
            {sections.map((s) => (
              <View
                key={s.id}
                onLayout={(e) => {
                  offsets.current[s.id] = e.nativeEvent.layout.y
                }}
                style={{
                  backgroundColor: c.card,
                  borderRadius: theme.radii.card,
                  borderWidth: 1,
                  borderColor: s.id === initialSection ? c.accent : c.line,
                  padding: SPACE.lg,
                  gap: SPACE.sm,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: c.accentWarm,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name={s.icon} size={16} color={c.accentDeep} />
                  </View>
                  <Title style={{ flex: 1 }}>{s.title}</Title>
                </View>
                {s.body.map((line, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: SPACE.sm }}>
                    <Small muted style={{ marginTop: 2 }}>
                      •
                    </Small>
                    <Body style={{ flex: 1 }}>{line}</Body>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
