/**
 * TranscriptConfirm — the "AI proposes, human commits" chip (CA1). After a voice
 * capture's audio is uploaded + transcribed, this shows the user WHAT WAS HEARD
 * (the transcript, in their own words) and the single numeral the AI extracted
 * at the money/quantity moment — with a ± stepper so a mis-heard count can be
 * corrected before it commits. Quantities at money moments are confirmable, not
 * silently trusted.
 *
 * Three visual states, driven by the parent:
 *   - 'listening'  → "Heard you — filing the audio…" (audio queued/uploading).
 *   - 'heard'      → transcript + confirmable numeral + Confirm / Fix buttons.
 *   - (dismissed)  → parent unmounts it.
 *
 * Neev theme, premium icons (`@expo/vector-icons`), ≥48px targets. Lives in
 * src/audio (the recorder's sibling), NOT src/ui.
 */
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, STATUS, TAP } from '../theme/tokens'
import { BodyStrong, Mono, Small } from '../ui'
import type { CaptureExtraction } from '../api/capture'

export interface TranscriptConfirmStrings {
  /** While the audio is still uploading/transcribing. */
  listening: string
  /** Heading above the transcript, e.g. "Here's what I heard". */
  heardTitle: string
  /** Low-confidence note shown when needs_clarification. */
  unsure: string
  /** Confirm CTA, e.g. "Confirm". */
  confirm: string
  /** Edit-the-number CTA, e.g. "Fix the number". */
  fix: string
  /** Dismiss / "looks right" without touching the number. */
  dismiss: string
  /** Label for the extracted numeral by kind. */
  headcountLabel: string
  quantityLabel: string
  amountLabel: string
}

export interface TranscriptConfirmProps {
  /** null = still listening/uploading; set once the transcript lands. */
  extraction: CaptureExtraction | null
  str: TranscriptConfirmStrings
  /** Fired when the user confirms (with the possibly-corrected numeral value). */
  onConfirm: (correctedValue: number | null) => void
  /** Fired when the user dismisses the chip. */
  onDismiss: () => void
}

function numeralLabel(
  key: 'headcount' | 'quantity' | 'amount',
  str: TranscriptConfirmStrings,
): string {
  if (key === 'headcount') return str.headcountLabel
  if (key === 'amount') return str.amountLabel
  return str.quantityLabel
}

export function TranscriptConfirm({
  extraction,
  str,
  onConfirm,
  onDismiss,
}: TranscriptConfirmProps) {
  const { theme } = useTheme()
  const c = theme.colors

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<number | null>(null)

  // Seed the editable value once the extracted numeral arrives.
  useEffect(() => {
    if (extraction?.numeral) setValue(extraction.numeral.value)
  }, [extraction?.numeral])

  // State 1: audio queued / transcript not back yet.
  if (!extraction) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.card,
          paddingVertical: SPACE.md,
          paddingHorizontal: SPACE.lg,
        }}
      >
        <Feather name="loader" size={18} color={c.accentDeep} />
        <Small muted style={{ flex: 1 }}>
          {str.listening}
        </Small>
      </View>
    )
  }

  const numeral = extraction.numeral
  const lowConf = extraction.needs_clarification

  return (
    <View
      style={{
        borderRadius: theme.radii.card,
        borderWidth: 1,
        borderColor: lowConf ? STATUS.warn : c.line,
        backgroundColor: c.card,
        padding: SPACE.lg,
        gap: SPACE.md,
        ...theme.shadowCard,
      }}
    >
      {/* What was heard — the user's own words back. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
        <Feather name="message-circle" size={18} color={c.accentDeep} />
        <View style={{ flex: 1, gap: 2 }}>
          <Small muted style={{ letterSpacing: 0.5 }}>
            {str.heardTitle}
          </Small>
          <BodyStrong>{extraction.heard}</BodyStrong>
          {lowConf ? (
            <Small color={STATUS.warn} style={{ fontWeight: '600' }}>
              {str.unsure}
            </Small>
          ) : null}
        </View>
      </View>

      {/* The confirmable numeral — money/quantity moment. */}
      {numeral && value != null ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: c.line,
            paddingTop: SPACE.md,
            gap: SPACE.sm,
          }}
        >
          <Small muted style={{ letterSpacing: 0.5 }}>
            {numeralLabel(numeral.key, str).toUpperCase()}
          </Small>
          {editing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
              <StepButton
                icon="minus"
                onPress={() => setValue((n) => Math.max(0, (n ?? 0) - 1))}
                disabled={value <= 0}
              />
              <Mono style={{ fontSize: 40, minWidth: 72, textAlign: 'center' }}>
                {String(value)}
              </Mono>
              <StepButton icon="plus" onPress={() => setValue((n) => (n ?? 0) + 1)} />
              {numeral.unit ? (
                <Small muted style={{ fontSize: 14 }}>
                  {numeral.unit}
                </Small>
              ) : null}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm }}>
              <Mono style={{ fontSize: 36 }}>{String(value)}</Mono>
              {numeral.unit ? <Small muted>{numeral.unit}</Small> : null}
            </View>
          )}
        </View>
      ) : null}

      {/* Actions: Confirm (commit) + Fix the number / Dismiss. */}
      <View style={{ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={str.confirm}
          onPress={() => onConfirm(value)}
          style={({ pressed }) => ({
            flexGrow: 1,
            minHeight: TAP,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: SPACE.sm,
            borderRadius: theme.radii.control,
            backgroundColor: c.accent,
            paddingHorizontal: SPACE.lg,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Feather name="check" size={20} color={c.onAccent} />
          <BodyStrong color={c.onAccent}>{str.confirm}</BodyStrong>
        </Pressable>

        {numeral ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={str.fix}
            onPress={() => setEditing((e) => !e)}
            style={({ pressed }) => ({
              minHeight: TAP,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: SPACE.xs,
              borderRadius: theme.radii.control,
              borderWidth: 1,
              borderColor: editing ? c.accent : c.line,
              backgroundColor: c.card,
              paddingHorizontal: SPACE.lg,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name="edit-2" size={16} color={c.accentDeep} />
            <BodyStrong color={c.accentDeep}>{str.fix}</BodyStrong>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={str.dismiss}
            onPress={onDismiss}
            style={({ pressed }) => ({
              minHeight: TAP,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radii.control,
              borderWidth: 1,
              borderColor: c.line,
              paddingHorizontal: SPACE.lg,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <BodyStrong color={c.accentDeep}>{str.dismiss}</BodyStrong>
          </Pressable>
        )}
      </View>
    </View>
  )
}

function StepButton({
  icon,
  onPress,
  disabled,
}: {
  icon: 'minus' | 'plus'
  onPress: () => void
  disabled?: boolean
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 2,
        borderColor: c.line,
        backgroundColor: c.paper,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      <Feather name={icon} size={24} color={c.text} />
    </Pressable>
  )
}
