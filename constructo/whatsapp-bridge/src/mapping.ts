/**
 * Pure mapping from a Baileys WAMessage to the backend RawMessage contract.
 *
 * This module is intentionally dependency-light and side-effect-free so it can
 * be exhaustively unit tested. Media *downloading* happens in index.ts; this
 * module only decides shape, type, text, mime, and whether a message is
 * ingestible at all.
 */
import type { proto, WAMessage } from "@whiskeysockets/baileys";

import type { MediaType, RawMessagePayload } from "./types.js";

// Re-export the Baileys message type so callers import it from one place.
export type { WAMessage };

/** Suffix that identifies a WhatsApp group JID. */
const GROUP_JID_SUFFIX = "@g.us";

/**
 * Result of inspecting a message's content: which MediaType it is, any text,
 * and (for media) the mime type plus the proto sub-message we can later
 * download. Returns null when the content is not ingestible.
 */
export interface ContentInfo {
  mediaType: MediaType;
  text: string | null;
  mediaMime: string | null;
  /** True when the message carries downloadable media. */
  hasMedia: boolean;
}

/** Is this JID a group chat? */
export function isGroupJid(jid: string | null | undefined): boolean {
  return typeof jid === "string" && jid.endsWith(GROUP_JID_SUFFIX);
}

/**
 * Inspect the proto message content and classify it. Returns null for content
 * we do not ingest (reactions, protocol/system messages, polls, unknown, etc.).
 */
export function classifyContent(
  message: proto.IMessage | null | undefined,
): ContentInfo | null {
  if (!message) return null;

  // Some messages are wrapped (ephemeral / view-once / device-sent). Unwrap one
  // level so we can read the real content. Baileys exposes normalizeMessageContent
  // for this, but we keep mapping dependency-free and unwrap the common cases.
  const inner =
    message.ephemeralMessage?.message ??
    message.viewOnceMessage?.message ??
    message.viewOnceMessageV2?.message ??
    message.viewOnceMessageV2Extension?.message ??
    message.documentWithCaptionMessage?.message ??
    message;

  // Plain text.
  if (typeof inner.conversation === "string" && inner.conversation.length > 0) {
    return { mediaType: "text", text: inner.conversation, mediaMime: null, hasMedia: false };
  }
  if (inner.extendedTextMessage?.text) {
    return {
      mediaType: "text",
      text: inner.extendedTextMessage.text,
      mediaMime: null,
      hasMedia: false,
    };
  }

  // Image.
  if (inner.imageMessage) {
    return {
      mediaType: "image",
      text: inner.imageMessage.caption ?? null,
      mediaMime: inner.imageMessage.mimetype ?? null,
      hasMedia: true,
    };
  }

  // Voice / audio. pttMessage is an older alias; audioMessage covers both
  // recorded voice notes (ptt=true) and shared audio files.
  if (inner.audioMessage) {
    return {
      mediaType: "voice",
      text: null,
      mediaMime: inner.audioMessage.mimetype ?? null,
      hasMedia: true,
    };
  }
  // Defensive: some proto versions expose pttMessage separately.
  const pttMessage = (inner as { pttMessage?: proto.Message.IAudioMessage }).pttMessage;
  if (pttMessage) {
    return {
      mediaType: "voice",
      text: null,
      mediaMime: pttMessage.mimetype ?? null,
      hasMedia: true,
    };
  }

  // Video.
  if (inner.videoMessage) {
    return {
      mediaType: "video",
      text: inner.videoMessage.caption ?? null,
      mediaMime: inner.videoMessage.mimetype ?? null,
      hasMedia: true,
    };
  }

  // Document.
  if (inner.documentMessage) {
    return {
      mediaType: "document",
      text: inner.documentMessage.caption ?? null,
      mediaMime: inner.documentMessage.mimetype ?? null,
      hasMedia: true,
    };
  }

  // Not ingestible: reactions, protocol messages, polls, contacts, locations,
  // stickers, system notifications, etc.
  return null;
}

/**
 * Convert a unix timestamp (seconds, possibly a Long-like object or string)
 * into an ISO8601 string. Falls back to now() if the timestamp is missing.
 */
export function timestampToIso(
  ts: number | Long | string | null | undefined,
): string {
  let seconds: number;
  if (ts == null) {
    seconds = Math.floor(Date.now() / 1000);
  } else if (typeof ts === "number") {
    seconds = ts;
  } else if (typeof ts === "string") {
    seconds = Number(ts);
  } else {
    // Long-like object from protobufjs (has toNumber()).
    seconds = typeof ts.toNumber === "function" ? ts.toNumber() : Number(ts);
  }
  if (!Number.isFinite(seconds) || seconds <= 0) {
    seconds = Math.floor(Date.now() / 1000);
  }
  return new Date(seconds * 1000).toISOString();
}

/** Minimal Long-like shape for the timestamp helper. */
type Long = { toNumber: () => number };

/**
 * Map a Baileys WAMessage to the RawMessage payload, or null when the message
 * should NOT be ingested. Reasons for null:
 *   - missing key/remoteJid
 *   - not a group chat (1:1, broadcast, status)
 *   - message authored by us (fromMe)
 *   - empty / unsupported content (reactions, protocol, polls, ...)
 *
 * The returned payload's `media_url` is always null here; index.ts fills it in
 * after downloading media (mapping stays pure / I/O-free).
 */
export function toRawMessage(msg: WAMessage): RawMessagePayload | null {
  const key = msg.key;
  if (!key?.remoteJid) return null;

  // Group chats only.
  if (!isGroupJid(key.remoteJid)) return null;

  // Ignore our own outgoing messages.
  if (key.fromMe) return null;

  const content = classifyContent(msg.message);
  if (!content) return null;

  // In a group, the actual sender is `participant`; fall back to remoteJid.
  const senderId = key.participant ?? msg.participant ?? key.remoteJid;

  return {
    source: "baileys",
    external_group_id: key.remoteJid,
    sender_id: senderId,
    sender_name: msg.pushName ?? null,
    media_type: content.mediaType,
    text: content.text,
    media_url: null,
    media_mime: content.mediaMime,
    sent_at: timestampToIso(msg.messageTimestamp as number | Long | string | null | undefined),
    // Pass the original message through verbatim for downstream debugging /
    // re-extraction. JSON.parse(JSON.stringify(...)) strips protobuf class
    // wrappers / Buffers into plain JSON the backend can store.
    raw: JSON.parse(JSON.stringify(msg)) as Record<string, unknown>,
  };
}

/** Whether a classified content carries downloadable media. Convenience for index.ts. */
export function messageHasMedia(msg: WAMessage): boolean {
  const content = classifyContent(msg.message);
  return content?.hasMedia ?? false;
}
