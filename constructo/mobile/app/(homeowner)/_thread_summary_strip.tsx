/**
 * ThreadSummaryStrip — the single pinned bar above the homeowner message thread.
 * The thread itself is pure human chat; everything AI-derived (progress updates,
 * approvals) lives on its own screen and is summarized here, one tap away.
 * Renders nothing when there is nothing waiting (the thread stays 100% chat).
 */
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../../src/theme/tokens'
import { Small } from '../../src/ui'

const STR = {
  en: {
    updates: (n: number) => `${n} update${n === 1 ? '' : 's'}`,
    needsYou: (n: number) => `${n} needs you`,
  },
  hi: {
    updates: (n: number) => `${n} अपडेट`,
    needsYou: (n: number) => `${n} पर ध्यान दें`,
  },
} as const

export function ThreadSummaryStrip({
  updateCount,
  needsYouCount,
  onOpenUpdates,
  onOpenDecisions,
  lang,
}: {
  updateCount: number
  needsYouCount: number
  onOpenUpdates: () => void
  onOpenDecisions: () => void
  lang: 'en' | 'hi'
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const t = STR[lang] ?? STR.en
  if (updateCount === 0 && needsYouCount === 0) return null

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        paddingHorizontal: SPACE.gutter,
        paddingVertical: SPACE.sm,
        backgroundColor: c.paper,
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      }}
    >
      <Feather name="layers" size={16} color={c.textMute} />

      {updateCount > 0 ? (
        <Pressable
          onPress={onOpenUpdates}
          accessibilityRole="button"
          hitSlop={8}
          style={{ minHeight: TAP, justifyContent: 'center' }}
        >
          <Small style={{ color: c.textMute }}>{t.updates(updateCount)}</Small>
        </Pressable>
      ) : null}

      {needsYouCount > 0 ? (
        <Pressable
          onPress={onOpenDecisions}
          accessibilityRole="button"
          hitSlop={8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minHeight: TAP,
            paddingHorizontal: SPACE.sm,
            borderRadius: theme.radii.pill,
            backgroundColor: AP.surfaceContainer,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.warn }} />
          <Small style={{ color: c.warn, fontWeight: '600' }}>{t.needsYou(needsYouCount)}</Small>
        </Pressable>
      ) : null}

      <View style={{ flex: 1 }} />
      <Feather name="chevron-right" size={16} color={c.textMute} />
    </View>
  )
}
