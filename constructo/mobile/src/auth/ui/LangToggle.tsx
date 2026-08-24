/**
 * LangToggle — EN | हिं pill for the signed-out screens, so a user picks their
 * language BEFORE reading anything else. Writes through `useT().setLang`
 * (persists to AsyncStorage; syncs to the profile once signed in).
 */
import { Pressable, View } from 'react-native'

import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { Small } from '../../ui'

const OPTIONS = [
  { value: 'en', label: 'EN' },
  { value: 'hi', label: 'हिं' },
] as const

export function LangToggle() {
  const { lang, setLang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        borderRadius: theme.radii.pill,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.card,
        padding: 2,
        minHeight: 40,
      }}
    >
      {OPTIONS.map((o) => {
        const on = lang === o.value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.value === 'en' ? 'English' : 'हिन्दी'}
            onPress={() => setLang(o.value)}
            hitSlop={6}
            style={{
              paddingHorizontal: 12,
              justifyContent: 'center',
              borderRadius: theme.radii.pill,
              backgroundColor: on ? c.text : 'transparent',
            }}
          >
            <Small color={on ? c.card : c.textMute} style={{ fontWeight: '600' }}>
              {o.label}
            </Small>
          </Pressable>
        )
      })}
    </View>
  )
}
