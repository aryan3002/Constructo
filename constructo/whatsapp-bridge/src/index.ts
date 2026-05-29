/**
 * Constructo WhatsApp bridge entry point.
 *
 * !!! PILOT ONLY !!!
 * This connects to WhatsApp via Baileys (an unofficial library). Using it is
 * against WhatsApp's Terms of Service and can get the linked number banned.
 * This is a conscious, accepted decision for design-partner pilots ONLY. It is
 * NOT production infrastructure and will be replaced by the official WhatsApp
 * Cloud API or a forward-to-bot source. See README.md.
 *
 * Flow:
 *   1. Authenticate via QR (multi-file auth state persisted to ./auth).
 *   2. Auto-reconnect on disconnect (unless logged out).
 *   3. On each incoming GROUP message, map -> RawMessage, download media if
 *      present, then POST to the backend ingest endpoint.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";

import { loadConfig } from "./config.js";
import { messageHasMedia, toRawMessage, type WAMessage } from "./mapping.js";
import { postRawMessage } from "./poster.js";
import type { RawMessagePayload } from "./types.js";

const log = pino({
  name: "whatsapp-bridge",
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});

const config = loadConfig();

// Map a mime type to a file extension for saved media, falling back to a
// sensible default per media type.
function extForMedia(mediaType: string, mime: string | null): string {
  if (mime) {
    const subtype = mime.split(";")[0].split("/")[1];
    if (subtype) {
      // ogg; codecs=opus -> ogg ; jpeg -> jpg
      const clean = subtype.replace(/[^a-z0-9]/gi, "");
      if (clean === "jpeg") return ".jpg";
      if (clean) return `.${clean}`;
    }
  }
  switch (mediaType) {
    case "image":
      return ".jpg";
    case "voice":
      return ".ogg";
    case "video":
      return ".mp4";
    case "document":
      return ".bin";
    default:
      return ".bin";
  }
}

/**
 * Download media for a message and write it under MEDIA_DIR. Returns the local
 * path used as media_url, or null on failure.
 *
 * For the pilot, media_url is a LOCAL FILESYSTEM PATH. The backend and the
 * bridge are assumed to share a volume (or run on the same host) during pilots.
 * When this is swapped for the Cloud API path, media_url will become a real
 * URL (object storage / signed URL). Documented in README.md.
 */
async function saveMedia(
  sock: WASocket,
  msg: WAMessage,
  mediaType: string,
  mime: string | null,
): Promise<string | null> {
  try {
    const buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      {
        logger: log,
        reuploadRequest: sock.updateMediaMessage,
      },
    );
    const id = msg.key.id ?? `${Date.now()}`;
    const filename = `${id}${extForMedia(mediaType, mime)}`;
    const absPath = resolve(join(config.mediaDir, filename));
    await writeFile(absPath, buffer as Buffer);
    log.info({ path: absPath, bytes: (buffer as Buffer).length }, "saved media");
    return absPath;
  } catch (err) {
    log.error({ err, key: msg.key }, "media download failed");
    return null;
  }
}

/** Process one incoming message: map, optionally download media, post. */
async function handleMessage(sock: WASocket, msg: WAMessage): Promise<void> {
  const payload: RawMessagePayload | null = toRawMessage(msg);
  if (!payload) return; // non-group, fromMe, or unsupported content

  if (messageHasMedia(msg)) {
    const path = await saveMedia(sock, msg, payload.media_type, payload.media_mime);
    payload.media_url = path;
  }

  try {
    await postRawMessage(payload, {
      backendUrl: config.backendUrl,
      apiKey: config.ingestApiKey,
      dryRun: config.dryRun,
    });
  } catch (err) {
    log.error({ err, group: payload.external_group_id }, "post failed");
  }
}

async function start(): Promise<void> {
  log.warn(
    "PILOT ONLY: Baileys is against WhatsApp ToS and may get the number banned. Not production infra.",
  );

  await mkdir(config.mediaDir, { recursive: true });
  await mkdir(config.authDir, { recursive: true });

  if (!config.dryRun && !config.ingestApiKey) {
    log.warn(
      "INGEST_API_KEY is empty; ingest POSTs will be rejected by the backend (401). Set it in .env or use DRY_RUN=true.",
    );
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

  const sock = makeWASocket({
    auth: state,
    logger: log,
    // We render the QR ourselves from the connection.update event; the built-in
    // printQRInTerminal option is deprecated, so we leave it unset.
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      log.info("Scan this QR code in WhatsApp > Linked Devices to link the bridge:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      log.info("WhatsApp connection open. Listening for GROUP messages.");
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      log.warn(
        { statusCode, loggedOut },
        loggedOut
          ? "Logged out. Delete the auth/ directory and re-link to reconnect."
          : "Connection closed; reconnecting...",
      );
      if (!loggedOut) {
        // Recreate the socket. Existing creds in ./auth are reused.
        void start();
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // "notify" = live incoming messages. "append" = history sync; skip those to
    // avoid re-ingesting old conversations on reconnect.
    if (type !== "notify") return;
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg as WAMessage);
      } catch (err) {
        log.error({ err }, "failed to handle message");
      }
    }
  });
}

start().catch((err) => {
  log.error({ err }, "fatal: bridge failed to start");
  process.exit(1);
});
