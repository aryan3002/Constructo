/**
 * ResendCode — "Resend in 30s" → "Resend code" link row, with a quiet
 * "Code sent again" confirmation once tapped. Driven by `useCountdown`.
 */
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { SPACE, TAP } from '../../theme/tokens'
import { BodyStrong, Small } from '../../ui'

export interface ResendCodeProps {
  seconds: number
  onResend: () => void
  busy?: boolean
  resent?: boolean
}

export function ResendCode({ seconds, onResend, busy, resent }: ResendCodeProps) {
  const { t } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const waiting = seconds > 0 || !!busy
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: TAP }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: waiting }}
        disabled={waiting}
        onPress={onResend}
        style={({ pressed }) => ({ minHeight: TAP, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
      >
        {waiting ? (
          <Small muted>{t('auth.resendIn', { s: seconds })}</Small>
        ) : (
          <BodyStrong color={c.accentDeep}>{t('auth.resend')}</BodyStrong>
        )}
      </Pressable>
      {resent && seconds > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="check" size={14} color={c.ok} />
          <Small color={c.ok}>{t('auth.codeResent')}</Small>
        </View>
      ) : null}
    </View>
  )
}
