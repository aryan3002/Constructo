import type {
  OwnerBrief,
  Site,
  SiteEvent,
  WhatsappGroup,
} from '../api/types'

export const MOCK_COMPANY_ID = 'company-1'

export const mockSites: Site[] = [
  {
    id: 'site-1',
    company_id: MOCK_COMPANY_ID,
    name: 'Green Valley Towers',
    location: 'Pune, MH',
    type: 'residential',
    status: 'active',
    created_at: '2026-01-12T06:00:00Z',
  },
  {
    id: 'site-2',
    company_id: MOCK_COMPANY_ID,
    name: 'Metro Mall Phase 2',
    location: 'Hyderabad, TG',
    type: 'commercial',
    status: 'active',
    created_at: '2026-02-03T06:00:00Z',
  },
  {
    id: 'site-3',
    company_id: MOCK_COMPANY_ID,
    name: 'Riverside Bridge',
    location: 'Surat, GJ',
    type: 'infrastructure',
    status: 'paused',
    created_at: '2025-11-20T06:00:00Z',
  },
]

export function mockBrief(date: string): OwnerBrief {
  return {
    id: `brief-${date}`,
    company_id: MOCK_COMPANY_ID,
    brief_date: date,
    sent_at: `${date}T07:30:00Z`,
    text:
      `Owner brief for ${date}. Green Valley Towers has a high-severity ` +
      `delay risk on slab pour. Metro Mall is on track. Riverside Bridge ` +
      `is paused pending steel delivery.`,
    payload: {
      brief_date: date,
      sites: [
        {
          site_id: 'site-1',
          name: 'Green Valley Towers',
          counts: { attendance: 42, deliveries: 3, issues: 2 },
          top_risks: [
            {
              site_id: 'site-1',
              kind: 'schedule_delay',
              severity: 'high',
              message: 'Slab pour for Tower B delayed 2 days — RMC not booked.',
              evidence_event_ids: ['ev-1', 'ev-2'],
            },
            {
              site_id: 'site-1',
              kind: 'safety',
              severity: 'med',
              message: 'Two workers reported without helmets at Block A.',
              evidence_event_ids: ['ev-3'],
            },
            {
              site_id: 'site-1',
              kind: 'attendance',
              severity: 'low',
              message: 'Steel-fixing crew 1 short of plan.',
              evidence_event_ids: [],
            },
          ],
        },
        {
          site_id: 'site-2',
          name: 'Metro Mall Phase 2',
          counts: { attendance: 88, deliveries: 5, issues: 0 },
          top_risks: [
            {
              site_id: 'site-2',
              kind: 'payment',
              severity: 'med',
              message: 'Plumbing vendor requested advance against pending RA bill.',
              evidence_event_ids: ['ev-7'],
            },
          ],
        },
        {
          site_id: 'site-3',
          name: 'Riverside Bridge',
          counts: { attendance: 0, deliveries: 0, issues: 1 },
          top_risks: [
            {
              site_id: 'site-3',
              kind: 'material',
              severity: 'high',
              message: 'Site paused — structural steel delivery slipped to next week.',
              evidence_event_ids: ['ev-9'],
            },
          ],
        },
      ],
    },
  }
}

export const mockEventsBySite: Record<string, SiteEvent[]> = {
  'site-1': [
    {
      id: 'ev-1',
      site_id: 'site-1',
      event_type: 'progress_update',
      occurred_on: '2026-05-28',
      summary: 'Tower B slab shuttering 80% complete.',
      fields: { tower: 'B', percent: 80 },
      confidence: 0.92,
      needs_clarification: false,
      source_message_ids: ['wa-101'],
      created_at: '2026-05-28T09:10:00Z',
    },
    {
      id: 'ev-2',
      site_id: 'site-1',
      event_type: 'issue',
      occurred_on: '2026-05-28',
      summary: 'RMC booking for slab pour missed — needs rescheduling.',
      fields: { blocker: 'RMC not booked' },
      confidence: 0.74,
      needs_clarification: true,
      source_message_ids: ['wa-102', 'wa-103'],
      created_at: '2026-05-28T10:02:00Z',
    },
    {
      id: 'ev-4',
      site_id: 'site-1',
      event_type: 'material_delivery',
      occurred_on: '2026-05-28',
      summary: '12 tonnes of TMT bars (Fe550) delivered to gate 2.',
      fields: { material: 'TMT Fe550', qty_tonnes: 12 },
      confidence: 0.97,
      needs_clarification: false,
      source_message_ids: ['wa-110'],
      created_at: '2026-05-28T11:20:00Z',
    },
    {
      id: 'ev-5',
      site_id: 'site-1',
      event_type: 'attendance',
      occurred_on: '2026-05-28',
      summary: '42 workers marked present across 5 crews.',
      fields: { present: 42, crews: 5 },
      confidence: 0.88,
      needs_clarification: false,
      source_message_ids: ['wa-098'],
      created_at: '2026-05-28T07:05:00Z',
    },
  ],
  'site-2': [
    {
      id: 'ev-7',
      site_id: 'site-2',
      event_type: 'payment_request',
      occurred_on: '2026-05-28',
      summary: 'Plumbing vendor requests advance against RA bill #4.',
      fields: { vendor: 'AquaFlow', amount: 250000, against: 'RA-4' },
      confidence: 0.81,
      needs_clarification: false,
      source_message_ids: ['wa-201'],
      created_at: '2026-05-28T12:00:00Z',
    },
    {
      id: 'ev-8',
      site_id: 'site-2',
      event_type: 'approval',
      occurred_on: '2026-05-28',
      summary: 'Architect approved revised facade glazing drawing.',
      fields: { drawing: 'FAC-12 Rev C' },
      confidence: 0.9,
      needs_clarification: false,
      source_message_ids: ['wa-205'],
      created_at: '2026-05-28T13:30:00Z',
    },
  ],
  'site-3': [
    {
      id: 'ev-9',
      site_id: 'site-3',
      event_type: 'issue',
      occurred_on: '2026-05-28',
      summary: 'Structural steel delivery slipped — site work paused.',
      fields: { material: 'structural steel', new_eta: '2026-06-03' },
      confidence: 0.7,
      needs_clarification: true,
      source_message_ids: ['wa-301'],
      created_at: '2026-05-28T08:45:00Z',
    },
  ],
}

export const mockGroups: WhatsappGroup[] = [
  {
    id: 'wg-1',
    company_id: MOCK_COMPANY_ID,
    external_group_id: '120363000000000001@g.us',
    source: 'whatsapp',
    site_id: 'site-1',
    label: 'Green Valley — Site Updates',
    created_at: '2026-01-15T06:00:00Z',
  },
  {
    id: 'wg-2',
    company_id: MOCK_COMPANY_ID,
    external_group_id: '120363000000000002@g.us',
    source: 'whatsapp',
    site_id: 'site-2',
    label: 'Metro Mall — Daily Log',
    created_at: '2026-02-05T06:00:00Z',
  },
]
