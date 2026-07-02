import { request } from './client'
import type { Photo } from './types'

export interface ContractorPhoto extends Photo {
  shared_by_name: string | null
}

export interface EnrichResult {
  caption_draft: string | null
  room_hint: string | null
}

export interface PhotoPresign {
  key: string
  put_url: string | null
  upload_mode: 'presigned' | 'multipart'
}

const q = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][]
  return entries.length ? '?' + new URLSearchParams(entries).toString() : ''
}

export const contractor = {
  presignPhoto: (siteId: string) =>
    request<PhotoPresign>('/api/v1/chat/media/presign', {
      method: 'POST',
      body: JSON.stringify({ site_id: siteId, kind: 'image' }),
    }),

  enrichPhoto: (input: { site_id: string; image_url: string; room_tag?: string }) =>
    request<EnrichResult>('/api/v1/publish/photo/enrich', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  publishPhoto: (
    input: {
      site_id: string
      image_url: string
      caption?: string
      room_tag?: string
      milestone_id?: string
    },
    opts?: { draft?: boolean },
  ) =>
    request<Photo>(
      `/api/v1/publish/photo${q({ with_draft: opts?.draft === false ? 'false' : undefined })}`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  publishedPhotos: (siteId: string, view: 'all' | 'room' | 'milestone' = 'all') =>
    request<ContractorPhoto[]>(`/api/v1/publish/photos${q({ site_id: siteId, view })}`),

  /**
   * "Send to feed" from a chat photo — the deferred half of the photo-share hybrid.
   * Server-authoritative: we pass a chat MESSAGE id (never a raw key); the backend
   * reuses that message's existing R2 attachment as the published photo's image_url,
   * records `source_chat_message_id` (UNIQUE → idempotent dedup), and publishes it to
   * the homeowner feed + contractor Album. Honest-AI gate: the caption is NEVER the
   * chat body — only what the contractor types in the sheet. Returns the published
   * photo (ContractorPhotoOut = Photo + shared_by_name).
   */
  sendChatPhotoToFeed: (messageId: string, body: { caption?: string; roomTag?: string }) =>
    request<ContractorPhoto>('/api/v1/publish/photo/from-chat', {
      method: 'POST',
      body: JSON.stringify({
        message_id: messageId,
        caption: body.caption,
        room_tag: body.roomTag,
      }),
    }),

  editPhoto: (id: string, patch: { caption?: string; room_tag?: string; is_starred?: boolean }) =>
    request<Photo>(`/api/v1/publish/photo/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deletePhoto: (id: string) =>
    request<void>(`/api/v1/publish/photo/${id}`, { method: 'DELETE' }),
}
