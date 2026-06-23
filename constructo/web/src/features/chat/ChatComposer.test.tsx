/**
 * ChatComposer — jsdom unit tests (Task 11).
 *
 * Assertions:
 *  1. Typing text and clicking Send calls onSend(body) and clears the textarea.
 *  2. Send button is disabled when the textarea is empty.
 *  3. Send button is disabled when `sending` prop is true.
 *  4. Enter key triggers send (Shift+Enter does not).
 *  5. Reply banner renders the snippet and the cancel button calls onCancelReply.
 *  6. Reply banner is absent when reply prop is null/undefined.
 *  7. File input element is present in the DOM (media affordance).
 *  8. Picking a file with upload_mode='presigned' calls chatApi.presignMedia and
 *     then fires onSendMedia with the right shape.
 *     NOTE: crypto.subtle.digest in jsdom is available (via @vitest/globals),
 *     but we assert the presign call shape and that onSendMedia fires — full
 *     sha256 verification would require a real crypto environment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mock chatApi — hoisted so vi.mock runs before the import below
// ---------------------------------------------------------------------------

vi.mock('../../api/chat', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/chat')>()
  return {
    ...original,
    chatApi: {
      ...original.chatApi,
      presignMedia: vi.fn(),
      uploadMedia: vi.fn(),
    },
  }
})

import { chatApi, type ChatAddress, type ChatMessage } from '../../api/chat'
import { ChatComposer } from './ChatComposer'

const mockPresign = chatApi.presignMedia as ReturnType<typeof vi.fn>
const mockUpload = chatApi.uploadMedia as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADDRESS: ChatAddress = { siteId: 'site-test-1' }

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_id: 'user-1',
    sender_side: 'contractor',
    sender_name: 'Priya Sharma',
    sender_role: 'supervisor',
    seq: 1,
    body: 'Hello from the site',
    reply_to_id: null,
    media_type: 'text',
    created_at: new Date().toISOString(),
    attachment_url: null,
    events: [],
    raw_status: null,
    sender_kind: 'user',
    meta: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Helper: render with sensible defaults
// ---------------------------------------------------------------------------

interface MakeProps {
  onSend?: ReturnType<typeof vi.fn>
  onSendMedia?: ReturnType<typeof vi.fn>
  onSendProposal?: ReturnType<typeof vi.fn>
  reply?: ChatMessage | null
  onCancelReply?: ReturnType<typeof vi.fn>
  sending?: boolean
}

function renderComposer(overrides: MakeProps = {}) {
  const onSend = overrides.onSend ?? vi.fn()
  const onSendMedia = overrides.onSendMedia ?? vi.fn()
  const onSendProposal = overrides.onSendProposal ?? vi.fn()
  const onCancelReply = overrides.onCancelReply ?? vi.fn()

  render(
    <ChatComposer
      onSend={onSend}
      onSendMedia={onSendMedia}
      onSendProposal={onSendProposal}
      reply={overrides.reply}
      onCancelReply={onCancelReply}
      sending={overrides.sending}
      address={ADDRESS}
    />,
  )

  return { onSend, onSendMedia, onSendProposal, onCancelReply }
}

// ---------------------------------------------------------------------------
// Text send
// ---------------------------------------------------------------------------

describe('ChatComposer — text send', () => {
  it('calls onSend with trimmed body and clears the textarea', async () => {
    const user = userEvent.setup()
    const { onSend } = renderComposer()

    const textarea = screen.getByRole('textbox')
    await user.click(textarea)
    await user.type(textarea, '  Hello site  ')

    const btn = screen.getByRole('button', { name: /send message/i })
    await user.click(btn)

    expect(onSend).toHaveBeenCalledOnce()
    expect(onSend).toHaveBeenCalledWith('Hello site')
    expect(textarea).toHaveValue('')
  })

  it('Send is disabled when textarea is empty', () => {
    renderComposer()
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled()
  })

  it('Send is disabled while sending=true even with text', async () => {
    const user = userEvent.setup()
    renderComposer({ sending: true })

    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'Hello')

    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled()
  })

  it('Enter sends the message; Shift+Enter does not', async () => {
    const user = userEvent.setup()
    const { onSend } = renderComposer()

    const textarea = screen.getByRole('textbox')
    await user.click(textarea)
    await user.type(textarea, 'Hello{Shift>}{Enter}{/Shift}')
    // Shift+Enter should NOT trigger send
    expect(onSend).not.toHaveBeenCalled()

    await user.type(textarea, '{Enter}')
    expect(onSend).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Reply banner
// ---------------------------------------------------------------------------

describe('ChatComposer — reply banner', () => {
  it('renders a reply banner with the message body snippet', () => {
    const msg = makeMsg({ body: 'Confirm the pour tomorrow' })
    renderComposer({ reply: msg })

    // Snippet text should be visible
    expect(screen.getByText(/confirm the pour tomorrow/i)).toBeInTheDocument()
  })

  it('prefers the first event summary over body', () => {
    const msg = makeMsg({
      body: 'raw body text',
      events: [
        {
          id: 'ev-1',
          event_type: 'attendance',
          occurred_on: new Date().toISOString(),
          summary: 'Morning muster: 8 workers present',
          fields: {},
          confidence: 0.9,
          needs_clarification: false,
          contested: false,
        },
      ],
    })
    renderComposer({ reply: msg })

    expect(screen.getByText(/morning muster/i)).toBeInTheDocument()
    // raw body should NOT be visible
    expect(screen.queryByText('raw body text')).not.toBeInTheDocument()
  })

  it('clicking cancel calls onCancelReply', async () => {
    const user = userEvent.setup()
    const msg = makeMsg()
    const { onCancelReply } = renderComposer({ reply: msg })

    await user.click(screen.getByRole('button', { name: /cancel reply/i }))
    expect(onCancelReply).toHaveBeenCalledOnce()
  })

  it('does NOT render a banner when reply is null', () => {
    renderComposer({ reply: null })
    expect(screen.queryByRole('button', { name: /cancel reply/i })).not.toBeInTheDocument()
  })

  it('does NOT render a banner when reply is undefined', () => {
    renderComposer({})
    expect(screen.queryByRole('button', { name: /cancel reply/i })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Media affordance
// ---------------------------------------------------------------------------

describe('ChatComposer — media affordance', () => {
  beforeEach(() => {
    mockPresign.mockReset()
    mockUpload.mockReset()
  })

  it('renders a file input element for media attachment', () => {
    renderComposer()
    // The hidden input[type=file] should always be in the DOM
    const fileInput = document.querySelector('input[type="file"]')
    expect(fileInput).toBeInTheDocument()
  })

  it('presign path: calls chatApi.presignMedia and fires onSendMedia', async () => {
    const onSendMedia = vi.fn()

    mockPresign.mockResolvedValue({
      key: 'chat/site-test-1/img-001.jpg',
      put_url: 'https://r2.example.com/presigned-put',
      upload_mode: 'presigned',
    })

    // Mock the global fetch for the presigned PUT
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    )

    renderComposer({ onSendMedia })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['fake-image-data'], 'photo.jpg', { type: 'image/jpeg' })

    // Simulate file selection
    fireEvent.change(fileInput, { target: { files: [file] } })

    // chatApi.presignMedia should be called with the right address + kind
    await waitFor(() => {
      expect(mockPresign).toHaveBeenCalledOnce()
    })
    expect(mockPresign).toHaveBeenCalledWith({ siteId: 'site-test-1', kind: 'image' })

    // The presigned PUT should be attempted
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://r2.example.com/presigned-put',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({ 'Content-Type': 'image/jpeg' }),
        }),
      )
    })

    // onSendMedia fires with the right shape
    await waitFor(() => {
      expect(onSendMedia).toHaveBeenCalledOnce()
    })
    const [payload] = onSendMedia.mock.calls[0]
    expect(payload.attachmentKey).toBe('chat/site-test-1/img-001.jpg')
    expect(payload.mime).toBe('image/jpeg')
    expect(payload.mediaType).toBe('image')
    expect(typeof payload.sha256).toBe('string')
    // NOTE: jsdom's crypto.subtle may return a real hash or an empty string
    // depending on the runtime; we verify the shape, not the hash value.

    fetchSpy.mockRestore()
  })

  it('normalises image/jpg MIME to image/jpeg for the presigned PUT', async () => {
    const onSendMedia = vi.fn()

    mockPresign.mockResolvedValue({
      key: 'chat/site-test-1/img-002.jpg',
      put_url: 'https://r2.example.com/presigned-put-2',
      upload_mode: 'presigned',
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    )

    renderComposer({ onSendMedia })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    // Simulate a browser that reports `image/jpg` (nonstandard)
    const file = new File(['fake'], 'bad.jpg', { type: 'image/jpg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(onSendMedia).toHaveBeenCalled())

    // The PUT must use the normalised MIME
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'image/jpeg' }),
      }),
    )
    const [payload] = onSendMedia.mock.calls[0]
    expect(payload.mime).toBe('image/jpeg')

    fetchSpy.mockRestore()
  })

  it('multipart fallback: calls chatApi.uploadMedia and fires onSendMedia', async () => {
    const onSendMedia = vi.fn()

    mockPresign.mockResolvedValue({
      key: 'chat/site-test-1/doc-001.pdf',
      put_url: null,
      upload_mode: 'multipart',
    })
    mockUpload.mockResolvedValue({
      key: 'chat/site-test-1/doc-001.pdf',
      media_type: 'document',
      sha256: 'abc123deadbeef',
    })

    renderComposer({ onSendMedia })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['%PDF-1.4...'], 'spec.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(onSendMedia).toHaveBeenCalledOnce())

    expect(mockUpload).toHaveBeenCalledWith(ADDRESS, file, 'document')
    const [payload] = onSendMedia.mock.calls[0]
    expect(payload.attachmentKey).toBe('chat/site-test-1/doc-001.pdf')
    expect(payload.sha256).toBe('abc123deadbeef')
    expect(payload.mediaType).toBe('document')
  })

  it('shows an error banner when presignMedia rejects', async () => {
    mockPresign.mockRejectedValue(new Error('Network timeout'))

    renderComposer()

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'img.png', { type: 'image/png' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Network timeout')
  })
})

// ---------------------------------------------------------------------------
// Slash commands (Phase B)
// ---------------------------------------------------------------------------

describe('ChatComposer — slash commands (Phase B)', () => {
  it('shows the slash menu when the text is a bare command', () => {
    renderComposer()
    const ta = screen.getByRole('textbox')
    fireEvent.change(ta, { target: { value: '/at' } })
    expect(screen.getByRole('listbox', { name: /slash commands/i })).toBeInTheDocument()
    // a11y: the textarea announces the open popup + the active option
    expect(ta).toHaveAttribute('aria-expanded', 'true')
    expect(ta).toHaveAttribute('aria-controls', 'slash-cmd-listbox')
    expect(ta).toHaveAttribute('aria-activedescendant', 'slash-cmd-att')
  })

  it('parses a slash command on send → onSendProposal, not onSend', () => {
    const { onSend, onSendProposal } = renderComposer()
    const ta = screen.getByRole('textbox')
    fireEvent.change(ta, { target: { value: '/att 24' } })
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onSendProposal).toHaveBeenCalledWith('attendance', { headcount: 24 })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows a usage hint for an incomplete command and does not send', () => {
    const { onSend, onSendProposal } = renderComposer()
    const ta = screen.getByRole('textbox')
    fireEvent.change(ta, { target: { value: '/del cement' } })
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    expect(onSendProposal).not.toHaveBeenCalled()
    expect(screen.getByText(/try:/i)).toBeInTheDocument()
  })

  it('sends ordinary text via onSend', () => {
    const { onSend, onSendProposal } = renderComposer()
    const ta = screen.getByRole('textbox')
    fireEvent.change(ta, { target: { value: 'good morning' } })
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('good morning')
    expect(onSendProposal).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Smart-suggest (Phase B)
// ---------------------------------------------------------------------------

describe('ChatComposer — smart-suggest (Phase B)', () => {
  it('offers a suggestion chip and sends it as a capture', () => {
    const { onSendProposal } = renderComposer()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'cement 50 bori aaya' } })
    fireEvent.click(screen.getByRole('button', { name: /log delivery/i }))
    expect(onSendProposal).toHaveBeenCalledWith(
      'delivery',
      expect.objectContaining({ material: 'cement', quantity: 50 }),
    )
  })

  it('shows no chip for a negation', () => {
    renderComposer()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'cement khatam' } })
    expect(screen.queryByRole('button', { name: /log delivery/i })).toBeNull()
  })
})
