/**
 * Dev component gallery — renders the Constructo RN kit in BOTH themes
 * (Neev + Daylight) so the design system can be reviewed at a glance.
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
  CaptureBar,
  Card,
  ConfirmCard,
  Display,
  EmptyState,
  EvidenceCard,
  EvidenceChip,
  H1,
  H2,
  Micro,
  Mono,
  MoneyCell,
  NeedsYouCard,
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
          <Button title="Approve" variant="accent" />
          <Button title="Secondary" variant="secondary" />
          <Button title="Ghost" variant="ghost" />
          <Button title="Hold" variant="danger" />
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

      <Section title="Neev · Money (ink-first, tabular ₹)">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xl }}>
          <MoneyCell amount={124000} size="lg" label="THIS SITE" />
          <MoneyCell amount={-4000} size="lg" label="VARIANCE" />
          <MoneyCell amount={250000} sign="in" size="lg" label="RECEIVED" />
        </View>
      </Section>

      <Section title="Neev · Status flag (folded corner)">
        <Card flag="risk">
          <BodyStrong>Cement bill — rate ₹20 over PO</BodyStrong>
          <Small muted>A flagged page in the register — flag pairs with a pill.</Small>
          <View style={{ marginTop: SPACE.sm, flexDirection: 'row' }}>
            <StatusPill status="risk" size="sm" label="At risk" />
          </View>
        </Card>
      </Section>

      <Section title="Neev · Evidence chips">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
          <EvidenceChip kind="slip" label="2 slips" count={2} />
          <EvidenceChip kind="doc" label="PO-0148" />
          <EvidenceChip kind="voice" label="Voice note" />
        </View>
      </Section>

      <Section title="Neev · NeedsYouCard (owner can approve)">
        <NeedsYouCard
          rank={1}
          status="warn"
          statusLabel="Needs approval"
          sla="by today"
          title="Cement bill — rate ₹20 over the PO"
          detail="Supervisor logged 2 delivery slips against PO-0148."
          evidence={[
            { kind: 'slip', label: '2 slips', count: 2 },
            { kind: 'doc', label: 'PO-0148' },
          ]}
          amount={124000}
          amountLabel="BILL"
          primaryLabel="Approve"
          secondaryLabel="Hold"
        />
      </Section>

      <Section title="Neev · NeedsYouCard (non-owner → propose lock)">
        <NeedsYouCard
          rank={2}
          status="info"
          statusLabel="Proposed"
          title="Advance for the steel order"
          detail="Site engineer proposed an advance to the vendor."
          amount={250000}
          amountLabel="ADVANCE"
          primaryLabel="Approve"
          canApprove={false}
          proposedBy="Site engineer"
        />
      </Section>

      <Section title="Neev · ConfirmCard (honest AI — high)">
        <ConfirmCard
          transcript="24 mazdoor aaye, 20 bori cement aaya"
          confidence="high"
          fields={[
            { label: 'Workers', value: '24', numeric: true },
            { label: 'Cement', value: '20 bags', numeric: true },
          ]}
        />
      </Section>

      <Section title="Neev · ConfirmCard (low confidence holds the send)">
        <ConfirmCard
          transcript="…cement aaya, kitne theek se nahi…"
          confidence="low"
          fields={[
            { label: 'Workers', value: '24', numeric: true },
            { label: 'Cement', value: '20 bags?', numeric: true, lowConfidence: true },
          ]}
        />
      </Section>

      <Section title="Neev · CaptureBar (hold-to-talk)">
        <Card padded={false} style={{ paddingVertical: SPACE.xl }}>
          <CaptureBar onCapture={() => undefined} onPhoto={() => undefined} onType={() => undefined} />
        </Card>
      </Section>

      <Section title="Neev · EmptyState (all clear / offline)">
        <Card padded={false}>
          <EmptyState variant="clear" title="All clear" body="Nothing needs you right now." />
        </Card>
        <Card padded={false}>
          <EmptyState
            variant="offline"
            title="Offline"
            body="Keep working — it'll sync the moment you're back online."
          />
        </Card>
      </Section>
    </View>
  )
}

export default function Gallery() {
  const insets = useSafeAreaInsets()
  const themes: { name: ThemeName; label: string }[] = [
    { name: 'neev', label: 'Neev — contractor' },
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
