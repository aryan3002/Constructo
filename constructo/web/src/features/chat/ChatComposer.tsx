/**
 * ChatComposer — the web composer for Constructo chat threads.
 *
 * A controlled, Neev-branded composer: reply banner, auto-growing multiline
 * textarea, Send button (Enter-to-send, Shift+Enter = newline), and a file
 * attachment affordance with presigned-PUT + multipart fallback.
 *
 * Slash commands / voice recording / smart-suggest are Phase B — see the
 * clearly-named slot comments below.
 *
 * Props are owned by the parent (which holds `useChatThread`) so this
 * component remains purely controlled and easy to test.
 */
import {
  useRef,
  useState,
  useMemo,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
  type DragEvent,
} from 'react'
import { newClientMsgId, type ChatAddress, type ChatMessage } from '../../api/chat'
import { canonicalMime, mimeToKind, uploadChatMedia } from './mediaUpload'
import { parseSlash, isSlash, SLASH_MENU, type SlashMenuItem } from './slash'
import { suggestCapture } from './suggest'
import { SlashMenu } from './SlashMenu'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MediaPayload {
  attachmentKey: string
  mime: string
  sha256: string
  mediaType: 'image' | 'document' | 'voice'
  /** The optimistic pending bubble's id (created at upload start). */
  clientMsgId?: string
}

export interface MediaStartPayload {
  clientMsgId: string
  /** Object-URL preview for images; absent for documents. */
  previewUrl?: string
  mediaType: 'image' | 'document' | 'voice'
  /** Source file, kept so a failed send can re-upload on retry. */
  file: File
}

export interface ChatComposerProps {
  /** Called with the trimmed text body; parent clears on success. */
  onSend: (body: string) => void
  /** Called after the media upload completes, with the upload receipt. */
  onSendMedia: (m: MediaPayload) => void
  /** Called at the START of an upload so an optimistic bubble can appear. */
  onMediaStart?: (m: MediaStartPayload) => void
  /** Called when the media upload fails, so the bubble can flip to "failed". */
  onMediaError?: (clientMsgId: string) => void
  /** Called when a slash-command or smart-suggest chip resolves to a capture. */
  onSendProposal: (captureType: string, fields: Record<string, unknown>) => void
  /** When set, a reply-banner renders above the textarea. */
  reply?: ChatMessage | null
  /** Called when the user dismisses the reply banner (×). */
  onCancelReply?: () => void
  /** While a message is in-flight; disables the Send button. */
  sending?: boolean
  /** Which chat thread is being composed into. */
  address: ChatAddress
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pull a short one-line snippet from a ChatMessage for the reply banner. */
function replySnippet(msg: ChatMessage): string {
  if (msg.events && msg.events.length > 0) return msg.events[0].summary
  return msg.body ?? '…'
}

// ---------------------------------------------------------------------------
// ChatComposer
// ---------------------------------------------------------------------------

export function ChatComposer({
  onSend,
  onSendMedia,
  onMediaStart,
  onMediaError,
  onSendProposal,
  reply,
  onCancelReply,
  sending = false,
  address,
}: ChatComposerProps) {
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Phase B — slash menu + smart-suggest state
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuDismissed, setMenuDismissed] = useState(false)
  const [usageHint, setUsageHint] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canSend = text.trim().length > 0 && !sending && !uploading

  // Slash menu: open while the text is a bare `/command` (no space typed yet).
  const slashMenuItems = useMemo<SlashMenuItem[]>(() => {
    const m = /^\/(\w*)$/.exec(text)
    if (!m) return []
    const prefix = m[1].toLowerCase()
    return SLASH_MENU.filter((c) => c.cmd.startsWith(prefix))
  }, [text])
  const showMenu = slashMenuItems.length > 0 && !menuDismissed
  const clampedActive = Math.min(activeIndex, Math.max(0, slashMenuItems.length - 1))
  // a11y: the textarea points aria-activedescendant at the highlighted option id.
  const activeOptionId =
    showMenu && slashMenuItems[clampedActive]
      ? `slash-cmd-${slashMenuItems[clampedActive].cmd}`
      : undefined

  // Smart-suggest: one chip for free text (never while typing a slash command).
  const suggestion = useMemo(() => (isSlash(text) ? null : suggestCapture(text)), [text])

  // Auto-grow the textarea up to ~6 rows (8px × 24 ≈ 192px)
  const autoGrow = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`
  }, [])

  // -------------------------------------------------------------------------
  // Text send
  // -------------------------------------------------------------------------

  const clearText = useCallback(() => {
    setText('')
    setUsageHint(null)
    setActiveIndex(0)
    setMenuDismissed(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [])

  const completeCommand = useCallback((item: SlashMenuItem) => {
    setText(`/${item.cmd} `)
    setActiveIndex(0)
    setUsageHint(null)
    textareaRef.current?.focus()
  }, [])

  const handleSend = useCallback(() => {
    const body = text.trim()
    if (!body || sending || uploading) return
    const parsed = parseSlash(body)
    if (parsed && 'error' in parsed) {
      const item = SLASH_MENU.find((c) => c.cmd === parsed.command)
      setUsageHint(item ? `Try: ${item.usage}` : 'Check the command format')
      return
    }
    if (parsed) {
      onSendProposal(parsed.capture_type, parsed.fields)
      clearText()
      textareaRef.current?.focus()
      return
    }
    onSend(body)
    clearText()
    // Keep focus in the composer so a mouse user can keep typing (WhatsApp Web).
    textareaRef.current?.focus()
  }, [text, sending, uploading, onSend, onSendProposal, clearText])

  const acceptSuggestion = useCallback(() => {
    if (!suggestion) return
    onSendProposal(suggestion.capture_type, suggestion.fields)
    clearText()
    textareaRef.current?.focus()
  }, [suggestion, onSendProposal, clearText])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (showMenu) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActiveIndex((i) => Math.min(i + 1, slashMenuItems.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActiveIndex((i) => Math.max(i - 1, 0))
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          completeCommand(slashMenuItems[clampedActive])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setMenuDismissed(true)
          return
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [showMenu, slashMenuItems, clampedActive, completeCommand, handleSend],
  )

  // -------------------------------------------------------------------------
  // Media upload
  // -------------------------------------------------------------------------

  const processFile = useCallback(
    async (file: File) => {
      setUploadError(null)
      setUploading(true)

      // Insert the optimistic pending bubble immediately (before the upload),
      // so a multi-second photo send shows up in the thread right away.
      const cid = newClientMsgId()
      const kind = mimeToKind(canonicalMime(file.type || 'application/octet-stream'))
      if (onMediaStart) {
        let previewUrl: string | undefined
        if (kind === 'image') {
          try {
            previewUrl = URL.createObjectURL(file)
          } catch {
            previewUrl = undefined
          }
        }
        onMediaStart({ clientMsgId: cid, previewUrl, mediaType: kind, file })
      }

      try {
        const { key, sha256, mime, mediaType } = await uploadChatMedia(address, file)
        onSendMedia({ attachmentKey: key, mime, sha256, mediaType, clientMsgId: cid })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        setUploadError(msg)
        onMediaError?.(cid)
      } finally {
        setUploading(false)
        // Clear the file input so the same file can be re-picked after an error
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [address, onSendMedia, onMediaStart, onMediaError],
  )

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) await processFile(file)
    },
    [processFile],
  )

  // Drop-zone handlers
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])
  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])
  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      if (uploading) return
      const file = e.dataTransfer.files?.[0]
      if (file) await processFile(file)
    },
    [processFile, uploading],
  )

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className="flex flex-col border-t border-edge bg-surface-card"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Reply banner — shown when replying to a specific message            */}
      {/* ------------------------------------------------------------------ */}
      {reply ? (
        <div className="flex items-center gap-2 border-l-2 border-brand bg-surface-sunken px-4 py-2">
          <p className="flex-1 truncate font-body text-small text-text-secondary">
            {replySnippet(reply)}
          </p>
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={onCancelReply}
            className="shrink-0 p-1 text-text-muted hover:text-text-primary"
          >
            {/* Feather "x" glyph — inline so no icon-font dep on web */}
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Drop-zone overlay                                                   */}
      {/* ------------------------------------------------------------------ */}
      {isDragging ? (
        <div
          aria-live="assertive"
          className="mx-3 mb-1 rounded-control border border-dashed border-brand bg-surface-sunken py-2 text-center font-body text-small text-text-secondary"
        >
          Drop file to attach
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Upload error banner                                                 */}
      {/* ------------------------------------------------------------------ */}
      {uploadError ? (
        <p
          role="alert"
          className="mx-3 mb-1 rounded-control bg-risk-bg px-3 py-1 font-body text-small text-risk-fg"
        >
          {uploadError}
        </p>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Input row: media button · textarea · send button                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative flex items-end gap-2 px-3 py-2">

        {/* Slash-command menu (Phase B) — anchored above the input row */}
        {showMenu ? (
          <SlashMenu
            items={slashMenuItems}
            activeIndex={clampedActive}
            onHoverIndex={setActiveIndex}
            onSelect={completeCommand}
          />
        ) : null}

        {/* Media button */}
        <button
          type="button"
          aria-label="Attach file"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="mb-1 shrink-0 text-text-muted hover:text-text-primary disabled:opacity-50"
        >
          {uploading ? (
            /* Minimal spinner — avoids an icon lib dep */
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="animate-spin"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          ) : (
            /* Feather "paperclip" glyph */
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          )}
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          aria-label="File attachment"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setMenuDismissed(false)
            if (usageHint) setUsageHint(null)
            autoGrow()
          }}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-expanded={showMenu}
          aria-controls={showMenu ? 'slash-cmd-listbox' : undefined}
          aria-activedescendant={activeOptionId}
          placeholder="Message…"
          rows={1}
          className="flex-1 resize-none overflow-hidden rounded-control border border-edge bg-surface-card px-3 py-2 font-body text-body text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand"
          style={{ minHeight: '40px', maxHeight: '192px' }}
        />

        {/* Voice recording is intentionally deferred this pass (web Phase B):
            desk users + MediaRecorder webm/STT friction. See the Phase B spec. */}

        {/* Send button */}
        <button
          type="button"
          aria-label="Send message"
          disabled={!canSend}
          onClick={handleSend}
          className="mb-1 shrink-0 rounded-full bg-brand px-4 py-2 font-body text-small text-text-on-brand disabled:opacity-50"
        >
          Send
        </button>
      </div>

      {/* Smart-suggest chip / usage hint (Phase B) — below the input row */}
      {usageHint ? (
        <p className="px-3 pb-2 font-body text-small text-text-muted">{usageHint}</p>
      ) : suggestion && !showMenu ? (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={acceptSuggestion}
            className="inline-flex items-center gap-1.5 rounded-full border border-celebrate/40 bg-celebrate-subtle px-3 py-1 font-body text-small font-medium text-celebrate-text hover:bg-surface-hover"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {suggestion.label}
          </button>
        </div>
      ) : null}
    </div>
  )
}
