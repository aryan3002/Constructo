/**
 * Homeowner "Heads up" — proactive Site Health findings that crossed the trust
 * membrane (schedule honesty + design fidelity), warm-reframed. Design cards are
 * a two-way loop: approve the change, dispute it (opens a builder handoff), or
 * ask for more. Plus a quiet "something else look off?" affordance.
 *
 * Calm Cockpit styling, mirrors the home-screen card containers.
 */
import { View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import { Body, Button, Eyebrow, Small, StatusPill } from '../../src/ui'
import type { HeadsUp, HeadsUpAction } from '../../src/api/client'

export function HeadsUpSection({
  data,
  busyId,
  flagBusy,
  onRespond,
  onFlag,
}: {
  data: HeadsUp | undefined
  /** The finding_id currently being responded to (only its buttons disable). */
  busyId?: string | null
  /** True while the "something else" flag is in flight. */
  flagBusy?: boolean
  onRespond: (findingId: string, action: HeadsUpAction) => void
  onFlag: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const cards = data?.cards ?? []
  if (cards.length === 0) return null

  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: theme.radii.card,
        borderWidth: 1,
        borderColor: c.line,
        overflow: 'hidden',
        padding: SPACE.lg,
        ...theme.shadowCard,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm }}>
        <Feather name="bell" size={14} color={c.textMute} />
        <Eyebrow>HEADS UP</Eyebrow>
      </View>

      {cards.map((card, i) => {
        const cardBusy = busyId === card.finding_id
        return (
          <View key={card.finding_id} style={{ marginTop: i === 0 ? 0 : SPACE.md }}>
            <StatusPill
              status={card.category === 'design' ? 'warn' : 'info'}
              size="sm"
              label={card.category === 'design' ? 'Design' : 'Schedule'}
            />
            <Body style={{ marginTop: SPACE.xs, color: c.text }}>{card.headline}</Body>

            {card.respondable ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.sm }}>
                <Button
                  title="I approved this"
                  variant="secondary"
                  disabled={cardBusy}
                  onPress={() => onRespond(card.finding_id, 'approved')}
                />
                <Button
                  title="This isn't right"
                  variant="primary"
                  disabled={cardBusy}
                  onPress={() => onRespond(card.finding_id, 'disputed')}
                />
                <Button
                  title="Show me more"
                  variant="ghost"
                  disabled={cardBusy}
                  onPress={() => onRespond(card.finding_id, 'show_more')}
                />
              </View>
            ) : (
              <Small muted style={{ marginTop: SPACE.xs }}>
                Your builder is on it.
              </Small>
            )}
          </View>
        )
      })}

      <View style={{ marginTop: SPACE.md, alignItems: 'flex-start' }}>
        <Button title="Something else look off?" variant="ghost" disabled={flagBusy} onPress={onFlag} />
      </View>
    </View>
  )
}
