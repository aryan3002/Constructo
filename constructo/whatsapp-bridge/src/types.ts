/**
 * Shared types for the WhatsApp -> Constructo ingest bridge.
 *
 * RawMessagePayload MUST match the backend contract at
 * backend/app/contracts/events.py (Pydantic `RawMessage`). The backend
 * defaults `id` and `received_at`, so we omit them here.
 */

/** Mirrors backend MediaType enum. */
export type MediaType = "text" | "image" | "voice" | "video" | "document";

/**
 * The JSON body POSTed to `${BACKEND_URL}/api/v1/ingest`.
 * Field names and nullability mirror the backend Pydantic model exactly.
 */
export interface RawMessagePayload {
  /** Capture source. Always "baileys" for this bridge. */
  source: "baileys";
  /** WhatsApp group JID, e.g. "12345-67890@g.us". */
  external_group_id: string;
  /** Sender participant JID, e.g. "11111@s.whatsapp.net". */
  sender_id: string;
  /** WhatsApp pushName, or null if unavailable. */
  sender_name: string | null;
  media_type: MediaType;
  /** Message body (text) or media caption; null when neither exists. */
  text: string | null;
  /** Path/URL the backend can later read the media from; null for text. */
  media_url: string | null;
  /** MIME type of the media; null for text. */
  media_mime: string | null;
  /** ISO8601 timestamp derived from the message's unix timestamp. */
  sent_at: string;
  /** Original Baileys message object, passed through verbatim. */
  raw: Record<string, unknown>;
}

/** Options for the poster. */
export interface PosterOptions {
  backendUrl: string;
  apiKey: string;
  /** When true, log the payload instead of POSTing. */
  dryRun?: boolean;
}

/* ------------------------------------------------------------------ */
/* Outbound /send contract (W2's Python sender posts to this verbatim) */
/* ------------------------------------------------------------------ */

/** Kind of outbound message. */
export type SendType = "text" | "reaction";

/**
 * Body of `POST /send`. Mirrors the shared bridge contract EXACTLY:
 *   { to, type: "text"|"reaction", text?, react_to_message_id?, reply_to_message_id? }
 */
export interface SendRequest {
  /** Destination JID (group "…@g.us" or user "…@s.whatsapp.net"). */
  to: string;
  type: SendType;
  /** Message body (type=text) or reaction emoji (type=reaction; defaults to ✅). */
  text?: string;
  /** Message id to react to. Required when type=reaction. */
  react_to_message_id?: string;
  /** Message id to quote/reply to. Optional; applies to type=text. */
  reply_to_message_id?: string;
}

/** Response body of `POST /send`. */
export interface SendResult {
  ok: boolean;
  /** WhatsApp message id of the sent message (or "dry-run:<ts>" in dry-run). */
  message_id: string;
}

/** Response body of `GET /health`. */
export interface HealthResult {
  ok: boolean;
  /** True when a live Baileys socket is present. */
  connected: boolean;
}
