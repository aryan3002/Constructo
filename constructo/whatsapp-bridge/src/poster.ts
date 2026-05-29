/**
 * POSTs a RawMessage payload to the Constructo backend ingest endpoint.
 *
 * Uses native fetch (Node 20+). Supports a dry-run mode (CLI --dry-run or env
 * DRY_RUN=true) that logs the payload instead of making an HTTP call, so the
 * mapping + post pipeline can be exercised without a live WhatsApp link or a
 * running backend.
 */
import pino from "pino";

import type { PosterOptions, RawMessagePayload } from "./types.js";

const log = pino({ name: "poster" });

/** Result of a post attempt. */
export interface PostResult {
  ok: boolean;
  /** HTTP status, or 0 in dry-run / network-error cases. */
  status: number;
  /** Backend-assigned id on success, when present. */
  id?: string;
  /** Whether this was a dry run (no HTTP performed). */
  dryRun: boolean;
}

const INGEST_PATH = "/api/v1/ingest";

/** Build the absolute ingest URL, tolerating a trailing slash on backendUrl. */
export function ingestUrl(backendUrl: string): string {
  return `${backendUrl.replace(/\/+$/, "")}${INGEST_PATH}`;
}

/**
 * Post a single RawMessage. In dry-run mode, logs the payload and returns
 * without calling fetch. Otherwise POSTs JSON with the X-Ingest-Key header.
 */
export async function postRawMessage(
  payload: RawMessagePayload,
  opts: PosterOptions,
): Promise<PostResult> {
  const url = ingestUrl(opts.backendUrl);

  if (opts.dryRun) {
    log.info(
      { url, payload },
      "[dry-run] would POST RawMessage (no HTTP performed)",
    );
    return { ok: true, status: 0, dryRun: true };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ingest-Key": opts.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log.error(
      { url, status: res.status, body: text },
      "ingest POST failed",
    );
    return { ok: false, status: res.status, dryRun: false };
  }

  // Backend returns { id: "<uuid>" }.
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  log.info({ url, status: res.status, id: body.id }, "ingest POST ok");
  return { ok: true, status: res.status, id: body.id, dryRun: false };
}
