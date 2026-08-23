/**
 * OtpField — six visible boxes over ONE hidden TextInput. The single input is
 * what keeps SMS autofill working (`oneTimeCode` / `one-time-code`); the boxes
 * are a pure projection of its value. Tapping anywhere focuses it; the caret
 * box is outlined in accent, an error outlines every box in risk.
 */
import { useEffect, useRef, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'

import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { SPACE } from '../../theme/tokens'
import { DataNum, Small } from '../../ui'

const LENGTH = 6

export interface OtpFieldProps {
  value: string
  onChange: (value: string) => void
  /** Fires ONCE when the 6th digit lands. */
  onComplete?: (value: string) => void
  error?: boolean
  autoFocus?: boolean
  disabled?: boolean
}

export function OtpField({ value, onChange, onComplete, error, autoFocus, disabled }: OtpFieldProps) {
  const { t } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const input = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  const firedFor = useRef<string | null>(null)

  useEffect(() => {
    if (value.length === LENGTH && firedFor.current !== value) {
      firedFor.current = value
      onComplete?.(value)
    }
    if (value.length < LENGTH) firedFor.current = null
  }, [value, onComplete])

  const caret = Math.min(value.length, LENGTH - 1)

  return (
    <View style={{ gap: SPACE.xs }}>
      <Small muted>{t('auth.otpLabel')}</Small>
      <Pressable
        accessible={false}
        onPress={() => input.current?.focus()}
        disabled={disabled}
        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.sm }}
      >
        {Array.from({ length: LENGTH }, (_, i) => {
          const ch = value[i] ?? ''
          const isCaret = focused && i === caret && !disabled
          return (
            <View
              key={i}
              style={{
                flex: 1,
                maxWidth: 56,
                height: 56,
                borderRadius: theme.radii.control,
                borderWidth: isCaret ? 2 : 1,
                borderColor: error ? c.risk : isCaret ? c.accent : ch ? c.text : c.line,
                backgroundColor: c.card,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <DataNum style={{ fontSize: 24, lineHeight: 30 }}>{ch}</DataNum>
            </View>
          )
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={LENGTH}
        autoFocus={autoFocus}
        editable={!disabled}
        caretHidden
        accessibilityLabel={t('auth.otpLabel')}
        // Off-canvas but focusable: keeps the keyboard + autofill alive while
        // the boxes above do the drawing.
        style={{ position: 'absolute', opacity: 0, height: 1, width: 1, left: 0, top: 0 }}
      />
    </View>
  )
}
