/**
 * ConfirmCard — Neev "Honest AI". The AI drafts what it heard, a human sends.
 * Confidence is always visible (a pill), and **low confidence HOLDS the send**:
 * the affirmative loses its marigold spark, drops to ink, relabels to "Check &
 * send", and a caution note appears. Never claims certainty it doesn't have.
 *
 * Labels are props (English defaults) so a screen renders ONE language.
 */
import { View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'
import Svg, { Path } from 'react-native-svg'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, type Status } from '../theme/tokens'
import { Button } from './Button'
import { StatusPill } from './StatusPill'
import { Body, BodyStrong, DataNum, MonoSm, Small } from './Typography'

/** marigold-700 — AA-legible marigold for the "AI DRAFT" eyebrow on white. */
const MARIGOLD_700 = '#9a6206'

export type Confidence = 'high' | 'medium' | 'low'

export interface ConfirmField {
  label: string
  value: string
  /** Render the value in tabular mono (amounts, counts). */
  numeric?: boolean
  /** Flag a field the AI is unsure about (dot + alert colour). */
  lowConfidence?: boolean
}

export interface ConfirmCardProps {
  heading?: string
  /** What the AI heard, shown as a quote. */
  transcript?: string
  fields?: ConfirmField[]
  confidence?: Confidence
  /** Eyebrow prefix — defaults to "AI DRAFT". */
  aiLabel?: string
  confidenceLabel?: string
  holdNote?: string
  confirmLabel?: string
  /** Label used when low confidence holds the send. */
  holdConfirmLabel?: string
  editLabel?: string
  onConfirm?: () => void
  onEdit?: () => void
  style?: ViewStyle
}

const CONF: Record<Confidence, { status: Status; label: string }> = {
  high: { status: 'ok', label: 'Sure' },
  medium: { status: 'info', label: 'Likely' },
  low: { status: 'warn', label: 'Check' },
}

function Spark({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2Z"
        fill={color}
      />
    </Svg>
  )
}

export function ConfirmCard({
  heading = "Here's what I heard",
  transcript,
  fields = [],
  confidence = 'high',
  aiLabel = 'AI DRAFT',
  confidenceLabel,
  holdNote = "Couldn't hear clearly — take a look before sending.",
  confirmLabel = 'Confirm',
  holdConfirmLabel = 'Check & send',
  editLabel = 'Edit',
  onConfirm,
  onEdit,
  style,
}: ConfirmCardProps) {
  const { theme } = useTheme()
  const c = theme.colors
  const conf = CONF[confidence]
  const hold = confidence === 'low' // honest AI: low confidence holds the send

  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: theme.radii.sheet,
          borderWidth: 1,
          borderColor: c.line,
          borderTopWidth: 3,
          borderTopColor: c.accent, // marigold capture spine
          padding: SPACE.lg,
        },
        theme.shadowCard,
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <Spark color={c.accent} />
          <MonoSm color={MARIGOLD_700} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }} numberOfLines={1}>
            {aiLabel} · {heading}
          </MonoSm>
        </View>
        <StatusPill status={conf.status} size="sm" label={confidenceLabel ?? conf.label} />
      </View>

      {transcript ? (
        <View style={{ marginTop: SPACE.md, marginBottom: SPACE.md, paddingLeft: SPACE.md, borderLeftWidth: 3, borderLeftColor: c.line }}>
          <Body color={c.text}>“{transcript}”</Body>
        </View>
      ) : null}

      {fields.length > 0 ? (
        <View style={{ borderRadius: theme.radii.control, overflow: 'hidden', backgroundColor: c.line }}>
          {fields.map((f, i) => (
            <View
              key={`${f.label}-${i}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: SPACE.md,
                backgroundColor: c.paper,
                paddingVertical: 11,
                paddingHorizontal: 13,
                marginBottom: i === fields.length - 1 ? 0 : 1,
              }}
            >
              <Small muted style={{ flexShrink: 1 }}>{f.label}</Small>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {f.lowConfidence ? <Small color={c.warn}>●</Small> : null}
                {f.numeric ? (
                  <DataNum color={f.lowConfidence ? c.warn : c.text} style={{ fontVariant: ['tabular-nums'] }}>
                    {f.value}
                  </DataNum>
                ) : (
                  <BodyStrong color={f.lowConfidence ? c.warn : c.text}>{f.value}</BodyStrong>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {hold ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: SPACE.md }}>
          <Feather name="alert-triangle" size={16} color={c.warn} style={{ marginTop: 1 }} />
          <Small color={c.warn} style={{ flex: 1 }}>{holdNote}</Small>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg }}>
        <Button
          title={editLabel}
          variant="secondary"
          onPress={onEdit}
          leading={<Feather name="edit-2" size={16} color={c.text} />}
          style={{ flex: 1 }}
        />
        <Button
          title={hold ? holdConfirmLabel : confirmLabel}
          variant={hold ? 'primary' : 'accent'}
          onPress={onConfirm}
          leading={<Feather name="check" size={18} color={hold ? '#f4f0e7' : c.onAccent} />}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  )
}
