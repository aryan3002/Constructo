/**
 * HomeownerAskRow — an inline "@ask" exchange rendered in her builder thread
 * (Slice B). She types `@ask <question>`; it is answered by the grounded engine
 * (`POST /homeowner/ask`, membrane-scoped) and shown right here instead of being
 * sent as a chat message. Calm Daylight: her question as a sage chip, the answer
 * as a warm card; a structural/abstain answer offers a one-tap builder hand-off.
 * Ephemeral (not persisted) — instant info, like the floating Ask pill.
 */
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../src/theme/tokens'
import { Body, Mono, Small } from '../../src/ui'

export type AskStatus = 'pending' | 'grounded' | 'abstain' | 'error'

const STR = {
  en: {
    you: 'You asked',
    home: 'Your home',
    thinking: 'Looking through your updates…',
    askBuilder: 'Ask your builder',
    err: 'We couldn’t answer that just now.',
  },
  hi: {
    you: 'आपने पूछा',
    home: 'आपका घर',
    thinking: 'आपके अपडेट देख रहे हैं…',
    askBuilder: 'अपने बिल्डर से पूछें',
    err: 'अभी जवाब नहीं दे सके।',
  },
} as const

export function HomeownerAskRow({
  question,
  status,
  answer,
  onAskBuilder,
}: {
  question: string
  status: AskStatus
  answer?: string
  onAskBuilder?: () => void
}) {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const t = STR[lang as 'en' | 'hi'] ?? STR.en

  return (
    <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md, gap: SPACE.sm }}>
      {/* Her question — right aligned on the sage chip. */}
      <View style={{ alignSelf: 'flex-end', maxWidth: '86%', gap: 2 }}>
        <Mono muted style={{ fontSize: 11, textAlign: 'right' }}>
          {t.you}
        </Mono>
        <View
          style={{
            backgroundColor: AP.chip,
            borderRadius: 19,
            borderBottomRightRadius: 6,
            paddingHorizontal: SPACE.lg,
            paddingVertical: SPACE.md,
          }}
        >
          <Body color={c.text}>{question}</Body>
        </View>
      </View>

      {/* The answer — left aligned, calm warm card. */}
      <View
        style={[
          {
            alignSelf: 'flex-start',
            maxWidth: '92%',
            backgroundColor: c.card,
            borderRadius: theme.radii.card,
            borderWidth: 1,
            borderColor: c.line,
            padding: SPACE.lg,
            gap: SPACE.xs,
          },
          theme.shadowCard,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="zap" size={13} color={c.accent} />
          <Small style={{ color: c.accentDeep, fontWeight: '600' }}>{t.home}</Small>
        </View>

        {status === 'pending' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <ActivityIndicator color={c.accent} size="small" />
            <Small muted>{t.thinking}</Small>
          </View>
        ) : status === 'error' ? (
          <Small muted>{t.err}</Small>
        ) : (
          <>
            {answer ? <Body color={c.text}>{answer}</Body> : null}
            {status === 'abstain' && onAskBuilder ? (
              <Pressable
                onPress={onAskBuilder}
                accessibilityRole="button"
                accessibilityLabel={t.askBuilder}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                  alignSelf: 'flex-start',
                }}
              >
                <Feather name="message-circle" size={15} color={c.accentDeep} />
                <Small style={{ color: c.accentDeep, fontWeight: '600' }}>{t.askBuilder}</Small>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  )
}
