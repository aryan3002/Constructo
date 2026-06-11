/**
 * Finishes — the homeowner's calm, read-only view of material finishes going
 * into their home, grouped room by room ("Calm Cockpit", handoff §finishes).
 *
 * Renders each room as a CalmCard with gentle finish lines inside:
 *   element (bold) · brand · colour · finish (muted, nulls omitted) · qty unit
 * plus a small StatusPill — "✓ Chosen" (ok/sage) or "Being decided" (quiet).
 *
 * Read-only — nothing the homeowner does here writes back.
 * Cost/pricing fields are NEVER sent by the backend and NEVER rendered here.
 *
 * String table follows the en/hi pattern used across every homeowner screen.
 */
import { ActivityIndicator, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { homeowner } from '../../src/api/client'
import type { FinishItem, RoomFinishes } from '../../src/api/types'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Display,
  FadeInUp,
  Screen,
  Small,
  StatusPill,
  FLOATING_NAV_CLEARANCE,
} from '../../src/ui'

// ---- localised copy ----
const STR = {
  en: {
    title: 'Your home, room by room',
    subtitle: 'The finishes chosen for your home — updated as decisions are made.',
    loading: 'Loading…',
    retry: 'Try again',
    error: 'Could not load your finishes.',
    empty: 'Finishes will appear here as they are chosen for your home.',
    chosen: '✓ Chosen',
    deciding: 'Being decided',
  },
  hi: {
    title: 'आपका घर, कमरा दर कमरा',
    subtitle: 'आपके घर के लिए चुनी गई सामग्री — जैसे-जैसे फ़ैसले होते हैं, अपडेट होती रहती है।',
    loading: 'लोड हो रहा है…',
    retry: 'फिर कोशिश करें',
    error: 'आपकी फ़िनिश लोड नहीं हो सकीं।',
    empty: 'जैसे-जैसे आपके घर के लिए सामग्री चुनी जाएगी, यहाँ दिखने लगेगी।',
    chosen: '✓ तय हो गया',
    deciding: 'तय हो रहा है',
  },
} as const

type Lang = 'en' | 'hi'

/** Build a muted "brand · colour · finish" detail string, omitting null parts. */
function finishDetail(item: FinishItem): string {
  return [item.brand, item.colour, item.finish].filter(Boolean).join(' · ')
}

/** "10 Sq Ft" — qty + unit, omitting nulls. */
function finishQty(item: FinishItem): string | null {
  if (!item.qty && !item.unit) return null
  return [item.qty, item.unit].filter(Boolean).join(' ')
}

// ---- sub-components ----

function Loading() {
  const { theme } = useTheme()
  return (
    <View style={{ paddingVertical: SPACE.xl, alignItems: 'center' }}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <Card>
      <Small muted>{message}</Small>
    </Card>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { lang } = useT()
  return (
    <Card>
      <View style={{ gap: SPACE.md }}>
        <Small color="#a4382a">{message}</Small>
        <Button title={STR[lang].retry} variant="secondary" onPress={onRetry} />
      </View>
    </Card>
  )
}

/** A single finish line: element + detail + qty + status chip. */
function FinishLine({ item, lang, isLast }: { item: FinishItem; lang: Lang; isLast: boolean }) {
  const { theme } = useTheme()
  const c = theme.colors
  const detail = finishDetail(item)
  const qty = finishQty(item)
  const str = STR[lang]
  const isChosen = item.status === 'chosen'

  return (
    <View
      style={{
        paddingVertical: SPACE.md,
        borderTopWidth: 1,
        borderTopColor: c.line,
        gap: SPACE.xs,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: SPACE.md,
        }}
      >
        <BodyStrong style={{ flex: 1 }}>{item.element}</BodyStrong>
        <StatusPill
          status={isChosen ? 'ok' : 'quiet'}
          label={isChosen ? str.chosen : str.deciding}
          size="sm"
          icon={isChosen ? 'check-circle' : 'clock'}
        />
      </View>
      {detail ? (
        <Small muted numberOfLines={2}>
          {detail}
        </Small>
      ) : null}
      {qty ? <Small muted>{qty}</Small> : null}
    </View>
  )
}

/** One room rendered as a CalmCard (ok/sage spine) with its finish lines inside. */
function RoomCard({ room, lang }: { room: RoomFinishes; lang: Lang }) {
  return (
    <CalmCard status="ok" title={room.room}>
      {room.items.map((item, i) => (
        <FinishLine
          key={`${item.element}-${i}`}
          item={item}
          lang={lang}
          isLast={i === room.items.length - 1}
        />
      ))}
    </CalmCard>
  )
}

// ---- main screen ----

export default function Finishes() {
  const { lang } = useT()
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]

  const q = useQuery({
    queryKey: ['homeowner', 'finishes'],
    queryFn: () => homeowner.finishes(),
  })

  return (
    <Screen style={{ paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE }}>
      {/* Header */}
      <View>
        <Display>{str.title}</Display>
        <Body muted style={{ marginTop: SPACE.xs }}>
          {str.subtitle}
        </Body>
      </View>

      {/* Content states */}
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={str.error} onRetry={() => void q.refetch()} />
      ) : !q.data || q.data.rooms.length === 0 ? (
        <Empty message={str.empty} />
      ) : (
        <View style={{ gap: SPACE.md }}>
          {q.data.rooms.map((room, i) => (
            <FadeInUp key={room.room} delay={Math.min(i, 4) * 30}>
              <RoomCard room={room} lang={lang} />
            </FadeInUp>
          ))}
        </View>
      )}
    </Screen>
  )
}
