import type { ConversationSummary } from './chat'
describe('ConversationSummary shape', () => {
  it('accepts a site-thread inbox row', () => {
    const row: ConversationSummary = {
      id: 'c1', kind: 'site', site_id: 's1', title: null, site_name: 'Site A',
      last_message_at: '2026-06-07T10:00:00Z', unread_count: 3, has_homeowner: false,
    }
    expect(row.unread_count).toBe(3)
    expect(row.kind).toBe('site')
  })
})
