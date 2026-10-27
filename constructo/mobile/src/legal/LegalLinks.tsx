/** Privacy policy · Terms — a quiet text row (sign-in screens). */
import { Pressable, View } from 'react-native'

import { useT } from '../i18n/I18nProvider'
import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'
import { Small } from '../ui/Typography'
import { LEGAL_LINKS, openLegal } from './openLegal'

export function LegalLinks() {
  const { t } = useT()
  const { theme } = useTheme()
  if (LEGAL_LINKS.length === 0) return null
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: SPACE.lg }}>
      {LEGAL_LINKS.map((l) => (
        <Pressable
          key={l.key}
          accessibilityRole="link"
          onPress={() => void openLegal(l.key)}
          hitSlop={8}
          style={({ pressed }) => ({ minHeight: TAP, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Small color={theme.colors.textMute} style={{ textDecorationLine: 'underline' }}>
            {t(l.labelKey)}
          </Small>
        </Pressable>
      ))}
    </View>
  )
}
