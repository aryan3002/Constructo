import { useState } from 'react'
import {
  Body,
  BriefCommandCard,
  Button,
  CaptureBar,
  ClarificationChip,
  Display,
  EvidenceCard,
  H1,
  H2,
  Micro,
  Mono,
  Small,
  SiteSwitcher,
  StatusDot,
  StatusPill,
  ThemeSurface,
  TimelineItem,
  type EvidenceItem,
  type SiteSummary,
  type Theme,
} from '../ui'

// ---- Demo data ------------------------------------------------------------

const demoEvidence: EvidenceItem[] = [
  {
    kind: 'photo',
    label: 'Site photo — slab B2',
    detail: 'Pour finished, curing started',
    meta: '09:42',
  },
  {
    kind: 'challan',
    label: 'Delivery challan #4471',
    detail: '50 bags OPC cement · UltraTech',
    meta: '₹18,500',
  },
  {
    kind: 'voice',
    label: 'Voice note — supervisor',
    detail: '“Slab pour done, crew leaving by 6.”',
    meta: '0:14',
  },
  {
    kind: 'message',
    label: 'WhatsApp — Site group',
    detail: 'Ramesh: B2 slab complete ✅',
    meta: '09:51',
  },
]

const demoSites: SiteSummary[] = [
  { id: 's1', name: 'Green Valley Towers', status: 'risk', meta: '3 risks' },
  { id: 's2', name: 'Lakeside Residency', status: 'warn', meta: '1 risk' },
  { id: 's3', name: 'Metro Business Park', status: 'ok', meta: 'on track' },
]

// ---- Layout helpers -------------------------------------------------------

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <H2>{title}</H2>
        {hint ? <Small>{hint}</Small> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

/** Renders the full kit inside one theme surface. */
function Kit({ theme }: { theme: Theme }) {
  const [siteId, setSiteId] = useState<string | null>('s1')
  const [log, setLog] = useState<string>('—')

  return (
    <ThemeSurface
      theme={theme}
      className="overflow-hidden rounded-sheet border border-line bg-bg"
    >
      <div className="border-b border-line bg-card px-4 py-2">
        <Micro className="font-semibold uppercase tracking-widest">
          {theme === 'site' ? 'Site · contractor (default)' : 'Daylight · homeowner'}
        </Micro>
      </div>

      <SiteSwitcher
        sites={demoSites}
        selectedId={siteId}
        onSelect={setSiteId}
        notificationCount={3}
        role={{ name: 'Owner', initials: 'RK' }}
      />

      <div className="space-y-8 p-4">
        <Section title="Typography" hint="Anek display · Hind body · Spline Sans Mono numerals">
          <Display>Display 28/34 — काम चालू है</Display>
          <H1>H1 22/28 — Today’s Brief</H1>
          <H2>H2 18/24 — Section header</H2>
          <Body>Body 16/24 — Plain-language summaries read here. मज़दूर हाज़िर.</Body>
          <Small>Small 14/20 — secondary copy and labels.</Small>
          <Micro>MICRO 12/16 — eyebrows & captions</Micro>
          <div>
            <Mono>₹ 1,84,500.00 · 09:42 IST · +91 98765 43210</Mono>
          </div>
        </Section>

        <Section title="Buttons" hint="Amber primary = the one decisive action; >=48px tap target">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Approve</Button>
            <Button variant="secondary">Hold</Button>
            <Button variant="ghost">Dismiss</Button>
            <Button variant="danger">Escalate</Button>
            <Button disabled>Disabled</Button>
          </div>
          <Button variant="primary" size="lg" block>
            Run brief now
          </Button>
        </Section>

        <Section title="Status" hint="Color is always paired with a distinct icon/shape — never color alone">
          <div className="flex flex-wrap gap-2">
            <StatusPill status="ok" />
            <StatusPill status="warn" />
            <StatusPill status="risk" />
            <StatusPill status="info" />
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-2">
              <StatusDot status="ok" /> <Small>ok</Small>
            </span>
            <span className="inline-flex items-center gap-2">
              <StatusDot status="warn" /> <Small>warn</Small>
            </span>
            <span className="inline-flex items-center gap-2">
              <StatusDot status="risk" /> <Small>risk</Small>
            </span>
          </div>
        </Section>

        <Section title="EvidenceCard" hint="The signature component — tap “Show proof” to expand evidence in place">
          <EvidenceCard
            claim="Slab pour completed on Tower B, level 2"
            status="ok"
            detail="Confirmed by photo + supervisor voice note"
            evidence={demoEvidence}
          />
          <EvidenceCard
            claim="Cement delivery short by 8 bags vs challan"
            status="risk"
            detail="Counted 42 of 50 bags on site"
            evidence={demoEvidence.slice(1, 3)}
          />
          <EvidenceCard
            claim="No update from Crew 3 today"
            status="warn"
            detail="Last seen yesterday 17:10"
            evidence={[]}
          />
        </Section>

        <Section title="BriefCommandCard" hint="Site-grouped risks with inline Approve / Hold / Assign">
          <BriefCommandCard
            siteName="Green Valley Towers"
            siteStatus="risk"
            meta="12 updates"
            onAction={(id, a) => setLog(`${a} → ${id}`)}
            risks={[
              {
                id: 'r1',
                claim: 'Slab pour delayed 2 days',
                status: 'risk',
                detail: 'Rebar inspection pending',
                evidence: demoEvidence.slice(0, 2),
              },
              {
                id: 'r2',
                claim: 'Helmet compliance dropped',
                status: 'warn',
                detail: '3 workers flagged in morning photo',
                evidence: demoEvidence.slice(0, 1),
              },
              {
                id: 'r3',
                claim: 'Payment request from vendor',
                status: 'info',
                detail: '₹1,84,500 — steel supplier',
                evidence: demoEvidence.slice(1, 2),
              },
              {
                id: 'r4',
                claim: 'Extra overflow risk (hidden)',
                status: 'warn',
              },
            ]}
          />
          <Small>Last action: <Mono>{log}</Mono></Small>
        </Section>

        <Section title="CaptureBar" hint="Field input — big Photo + hold-to-talk, tiny type escape hatch">
          <CaptureBar
            onPhoto={() => setLog('photo')}
            onTalkStart={() => setLog('talk start')}
            onTalkEnd={(ms) => setLog(`talk ${ms}ms`)}
            onType={() => setLog('type')}
          />
        </Section>

        <Section title="ClarificationChip" hint="One question, 2–3 tappable answers">
          <ClarificationChip
            question="Was the 50 bags cement for Tower A or Tower B?"
            answers={[
              { id: 'a', label: 'Tower A' },
              { id: 'b', label: 'Tower B' },
              { id: 'both', label: 'Split both' },
            ]}
            onAnswer={(id) => setLog(`clarify → ${id}`)}
          />
        </Section>

        <Section title="TimelineItem" hint="Type badge · summary · time · confidence (shown when <100%) · evidence link">
          <ol>
            <TimelineItem
              typeLabel="Delivery"
              typeClassName="bg-info/10 text-info border border-info/30"
              summary="50 bags of OPC cement received from UltraTech"
              occurredOn="Today 09:42"
              confidence={0.96}
              hasEvidence
              onViewEvidence={() => setLog('evidence: delivery')}
            />
            <TimelineItem
              typeLabel="Issue"
              typeClassName="bg-risk/10 text-risk border border-risk/30"
              summary="Possible water seepage in basement — needs review"
              occurredOn="Today 11:05"
              confidence={0.62}
              hasEvidence
              onViewEvidence={() => setLog('evidence: issue')}
            />
            <TimelineItem
              typeLabel="Attendance"
              typeClassName="bg-ok/10 text-ok border border-ok/30"
              summary="42 workers marked present"
              occurredOn="Today 08:30"
              isLast
            />
          </ol>
        </Section>
      </div>
    </ThemeSurface>
  )
}

/**
 * /components — a Storybook-lite gallery rendering every component in BOTH
 * themes so the team can see the kit. Mobile-responsive (stacks on small
 * screens, two columns on large).
 */
export function Components() {
  return (
    <div className="cstk-root min-h-screen bg-bg">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <Micro className="font-semibold uppercase tracking-widest text-primary-deep">
            Constructo design system
          </Micro>
          <Display as="h1">Blueprint &amp; Daylight</Display>
          <Body className="mt-1 max-w-2xl">
            The component kit, rendered in both themes. Site (contractor) is the
            default warm, bold surface; Daylight (homeowner) is the softer,
            rounded surface. Both share one token spine.
          </Body>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Kit theme="site" />
          <Kit theme="daylight" />
        </div>
      </div>
    </div>
  )
}
