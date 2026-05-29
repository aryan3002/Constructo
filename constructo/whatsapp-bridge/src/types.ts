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
