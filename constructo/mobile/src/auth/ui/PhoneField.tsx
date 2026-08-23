/**
 * PhoneField — a fixed `+91` chip beside a 10-digit input that groups as the
 * user types (`98765 43210`). The parent holds DIGITS ONLY; `toE164` turns them
 * into what the API wants. Label + hint are always rendered (never
 * placeholder-only), and the field flips its border to `risk` on error.
 */
import { useState } from 'react'
import { TextInput, View } from 'react-native'

import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { SPACE } from '../../theme/tokens'
import { Small, useInputStyle } from '../../ui'
import { digitsOnly, formatIndianMobile } from '../auth.util'

export interface PhoneFieldProps {
  digits: string
  onChange: (digits: string) => void
  hint?: string
  error?: boolean
  autoFocus?: boolean
  /** Fired on the keyboard's "done" — lets the parent submit when valid. */
  onSubmit?: () => void
}

export function PhoneField({ digits, onChange, hint, error, autoFocus, onSubmit }: PhoneFieldProps) {
  const { t } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const inputStyle = useInputStyle()
  const [focused, setFocused] = useState(false)
  const border = error ? c.risk : focused ? c.accent : c.line

  return (
    <View style={{ gap: SPACE.xs }}>
      <Small muted>{t('auth.phoneLabel')}</Small>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          borderWidth: 1,
          borderColor: border,
          borderRadius: theme.radii.control,
          backgroundColor: c.card,
          overflow: 'hidden',
        }}
      >
        <View
          accessible={false}
          style={{
            paddingHorizontal: SPACE.md,
            justifyContent: 'center',
            backgroundColor: c.paper,
            borderRightWidth: 1,
            borderRightColor: border,
          }}
        >
          <Small style={{ fontWeight: '600', letterSpacing: 0 }}>+91</Small>
        </View>
        <TextInput
          value={formatIndianMobile(digits)}
          onChangeText={(text) => onChange(digitsOnly(text))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          autoFocus={autoFocus}
          maxLength={11} // 10 digits + the space
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          accessibilityLabel={t('auth.phoneLabel')}
          placeholder={t('auth.phonePlaceholder')}
          placeholderTextColor={c.textMute}
          style={[inputStyle, { flex: 1, borderWidth: 0, borderRadius: 0, fontSize: 18 }]}
        />
      </View>
      {hint ? <Small muted>{hint}</Small> : null}
    </View>
  )
}
