/**
 * NeedsYouCard — the Owner "Decide" moment: a ranked exception with evidence and
 * ONE confident action. Carries the Neev hard-truths:
 *   · status as a folded-corner flag + a StatusPill (never colour alone);
 *   · money is ink-first (MoneyCell), tracking-only;
 *   · capability-gated — a non-owner sees a "proposed → only the owner approves"
 *     lock and a Review action, never an Approve they can't take;
 *   · tone gates the spark — `affirmative` keeps the marigold "yes"; `cautionary`
 *     (Hold/stop) drops to ink.
 *
 * Labels are props (English defaults) so a screen renders ONE language.
 */
import { View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, type Status } from '../theme/tokens'
import { Button } from './Button'
import { Card } from './Card'
import { EvidenceChip, type EvidenceChipProps } from './EvidenceChip'
import { MoneyCell } from './MoneyCell'
import { StatusPill } from './StatusPill'
import { MonoSm, Small, Title } from './Typography'
import type { MoneySign } from './money'

export type NeedsYouTone = 'affirmative' | 'cautionary'

export interface NeedsYouCardProps {
  rank?: number
  status?: Status
  statusLabel: string
  title: string
  detail?: string
  evidence?: EvidenceChipProps[]
  amount?: number
  amountLabel?: string
  amountSign?: MoneySign
  /** A short "by when" line, e.g. "by today". */
  sla?: string
  primaryLabel: string
  secondaryLabel?: string
  reviewLabel?: string
  tone?: NeedsYouTone
  /** Capability gate — false hides Approve and shows the propose lock + Review. */
  canApprove?: boolean
  proposedBy?: string
  /** The lock message; `{by}` is replaced with `proposedBy`. */
  proposeNote?: string
  onPrimary?: () => void
  onSecondary?: () => void
  onEvidence?: (e: EvidenceChipProps, index: number) => void
  /** Hide the folded-corner status flag (the owner app opts out of it). */
  hideFlag?: boolean
  style?: ViewStyle
}

export function NeedsYouCard({
  rank,
  status = 'warn',
  statusLabel,
  title,
  detail,
  evidence = [],
  amount,
  amountLabel,
  amountSign = 'auto',
  sla,
  primaryLabel,
  secondaryLabel,
  reviewLabel = 'Review',
  tone = 'affirmative',
  canApprove = true,
  proposedBy,
  proposeNote = '{by} proposed this — only the owner can approve.',
  onPrimary,
  onSecondary,
  onEvidence,
  hideFlag = false,
  style,
}: NeedsYouCardProps) {
  const { theme } = useTheme()
  const c = theme.colors
  const showLock = !canApprove && !!proposedBy

  return (
    <Card
      {...(hideFlag ? {} : { flag: status, flagSize: 38 })}
      style={hideFlag ? (style as ViewStyle) : [{ paddingRight: SPACE.lg + 12 }, style as ViewStyle]}
    >
      {/* head: rank · status · sla */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingRight: 24 }}>
        {rank != null ? <MonoSm color={c.textMute}>#{rank}</MonoSm> : null}
        <StatusPill status={status} size="sm" label={statusLabel} />
        {sla ? <MonoSm color={c.textMute}>· {sla}</MonoSm> : null}
      </View>

      <Title style={{ marginTop: 10 }}>{title}</Title>
      {detail ? (
        <Small muted style={{ marginTop: 5 }}>
          {detail}
        </Small>
      ) : null}

      {evidence.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
          {evidence.map((e, i) => (
            <EvidenceChip key={i} {...e} onPress={() => onEvidence?.(e, i)} />
          ))}
        </View>
      ) : null}

      {showLock ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 8,
            marginTop: 13,
            padding: 11,
            borderRadius: theme.radii.control,
            backgroundColor: c.infoTint,
          }}
        >
          <Feather name="lock" size={15} color={c.info} style={{ marginTop: 1 }} />
          <Small color={c.info} style={{ flex: 1 }}>
            {proposeNote.replace('{by}', proposedBy as string)}
          </Small>
        </View>
      ) : null}

      {/* foot: amount left · actions right */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: SPACE.md,
          marginTop: 15,
        }}
      >
        {amount != null ? (
          <MoneyCell amount={amount} sign={amountSign} size="lg" label={amountLabel} />
        ) : (
          <View />
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          {secondaryLabel ? (
            <Button title={secondaryLabel} variant="ghost" size="md" onPress={onSecondary} />
          ) : null}
          {canApprove ? (
            <Button
              title={primaryLabel}
              variant={tone === 'cautionary' ? 'primary' : 'accent'}
              size="md"
              onPress={onPrimary}
            />
          ) : (
            <Button title={reviewLabel} variant="secondary" size="md" onPress={onPrimary} />
          )}
        </View>
      </View>
    </Card>
  )
}
