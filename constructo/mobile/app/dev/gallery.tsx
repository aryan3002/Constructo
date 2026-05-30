/**
 * Dev component gallery — renders the Constructo RN kit in BOTH themes
 * (Blueprint + Daylight) so the design system can be reviewed at a glance.
 * Reachable from the homeowner Home; not part of the shipping nav.
 */
import { ScrollView, View } from 'react-native'
import { Link } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ThemeProvider, useTheme } from '../../src/theme/ThemeProvider'
import { SPACE, type ThemeName } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Display,
  EvidenceCard,
  H1,
  H2,
  Micro,
  Mono,
  Small,
  StatusPill,
  TimelineItem,
} from '../../src/ui'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: SPACE.sm }}>
      <Micro muted style={{ letterSpacing: 1 }}>
        {title.toUpperCase()}
      </Micro>
      {children}
    </View>
  )
}

function KitShowcase({ label }: { label: string }) {
  const { theme } = useTheme()
  return (
    <View
      style={{
        backgroundColor: theme.colors.bg,
        borderRadius: theme.radii.card,
        padding: SPACE.lg,
        gap: SPACE.lg,
      }}
    >
      <View>
        <Small muted>{label}</Small>
        <Display>Aa Bb 123</Display>
      </View>

      <Section title="Type scale">
        <H1>H1 — Screen title</H1>
        <H2>H2 — Section header</H2>
        <Body>Body — plain language copy that a homeowner reads.</Body>
        <Small muted>Small — secondary, muted.</Small>
        <Mono>₹ 12,40,000 · 09:24</Mono>
      </Section>

      <Section title="Buttons">
        <Button title="Primary action" block />
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <Button title="Secondary" variant="secondary" />
          <Button title="Ghost" variant="ghost" />
        </View>
      </Section>

      <Section title="Status">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
          <StatusPill status="ok" />
          <StatusPill status="warn" />
          <StatusPill status="risk" />
          <StatusPill status="info" />
        </View>
      </Section>

      <Section title="Card">
        <Card>
          <BodyStrong>A plain card surface</BodyStrong>
          <Small muted>Hairline border, theme radius, soft lift.</Small>
        </Card>
      </Section>

      <Section title="CalmCard (homeowner)">
        <CalmCard
          eyebrow="Today"
          title="Slab work finished on the first floor"
          body="Nothing needs you right now."
          status="ok"
        />
      </Section>

      <Section title="EvidenceCard">
        <EvidenceCard
          claim="Slab pour completed on the first floor"
          detail="Reported by your site supervisor"
          status="ok"
          defaultOpen
          evidence={[
            { kind: 'photo', label: 'Site photo', detail: 'Ground floor, east wing', meta: '09:24' },
            { kind: 'message', label: 'Supervisor note', detail: 'Slab done, curing started' },
          ]}
        />
      </Section>

      <Section title="Timeline">
        <View>
          <TimelineItem typeLabel="Delivery" summary="20 bags of cement delivered" occurredOn="Yesterday" />
          <TimelineItem typeLabel="Progress" summary="Plastering started in the kitchen" occurredOn="Today" isLast />
        </View>
      </Section>
    </View>
  )
}

export default function Gallery() {
  const insets = useSafeAreaInsets()
  const themes: { name: ThemeName; label: string }[] = [
    { name: 'blueprint', label: 'Blueprint — contractor' },
    { name: 'daylight', label: 'Daylight — homeowner' },
  ]
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#1a1c22' }}
      contentContainerStyle={{
        padding: SPACE.lg,
        paddingTop: insets.top + SPACE.lg,
        paddingBottom: insets.bottom + SPACE.xl,
        gap: SPACE.lg,
      }}
    >
      <Link href="/(homeowner)/home" style={{ color: '#ffffff' }}>
        ← Back
      </Link>
      {themes.map((th) => (
        <ThemeProvider key={th.name} initial={th.name}>
          <KitShowcase label={th.label} />
        </ThemeProvider>
      ))}
    </ScrollView>
  )
}
