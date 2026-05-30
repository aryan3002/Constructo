/**
 * Outbound sending: maps a /send request to a Baileys sendMessage call.
 *
 * The request→Baileys mapping is split into a PURE function (`buildSendPlan`)
 * so it can be unit-tested without a live socket, and a thin `sendMessage`
 * wrapper that applies the plan to a WASocket (or logs it in dry-run).
 */
import pino from "pino";

import type {
  AnyMessageContent,
  MiscMessageGenerationOptions,
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import type { SendRequest, SendResult } from "./types.js";

const log = pino({ name: "sender" });

/** The default emoji used for a "reaction" when none is supplied. */
export const DEFAULT_REACTION = "✅"; // ✅

/**
 * A fully-resolved instruction for `sock.sendMessage(jid, content, options)`.
 * Pure data — no socket involved — so the mapping is trivially testable.
 */
export interface SendPlan {
  jid: string;
  content: AnyMessageContent;
  options: MiscMessageGenerationOptions;
}

/** Thrown when a /send request body is invalid; carries the 400 reason. */
export class SendValidationError extends Error {}

/**
 * Build a minimal WAMessage that carries only a key, suitable for use as the
 * `quoted` message in MiscMessageGenerationOptions. Baileys only needs the key
 * (remoteJid + id) to thread a reply, so we avoid fabricating a full message.
 */
function quotedStub(jid: string, messageId: string): WAMessage {
  return {
    key: { remoteJid: jid, id: messageId, fromMe: false },
    // `message` is required on the proto type but may be empty for a quote ref.
    message: {},
  } as WAMessage;
}

/**
 * Pure mapping: validate a SendRequest and produce a SendPlan.
 * Throws SendValidationError on malformed input (caller maps to HTTP 400).
 */
export function buildSendPlan(req: SendRequest): SendPlan {
  if (!req || typeof req.to !== "string" || req.to.trim() === "") {
    throw new SendValidationError("`to` is required and must be a non-empty string");
  }
  const jid = req.to;
  const options: MiscMessageGenerationOptions = {};

  if (req.type === "text") {
    if (typeof req.text !== "string" || req.text === "") {
      throw new SendValidationError("`text` is required and must be a non-empty string for type=text");
    }
    if (req.reply_to_message_id) {
      options.quoted = quotedStub(jid, req.reply_to_message_id);
    }
    return { jid, content: { text: req.text }, options };
  }

  if (req.type === "reaction") {
    if (typeof req.react_to_message_id !== "string" || req.react_to_message_id === "") {
      throw new SendValidationError(
        "`react_to_message_id` is required and must be a non-empty string for type=reaction",
      );
    }
    // An empty-string reaction text removes a reaction; we default to a check.
    const emoji = typeof req.text === "string" ? req.text : DEFAULT_REACTION;
    return {
      jid,
      content: {
        react: {
          text: emoji,
          key: { remoteJid: jid, id: req.react_to_message_id, fromMe: false },
        },
      },
      options,
    };
  }

  throw new SendValidationError(`unsupported type: ${String((req as { type?: unknown }).type)}`);
}

/** Minimal surface of WASocket the sender needs; eases mocking in tests. */
export type SendableSocket = Pick<WASocket, "sendMessage">;

/**
 * Apply a SendRequest to the socket (or log it in dry-run).
 * Returns the contract response shape { ok, message_id }.
 *
 * In dry-run the message_id is a synthetic "dry-run:<ts>" so callers still get
 * a stable, non-empty id without touching WhatsApp.
 */
export async function send(
  req: SendRequest,
  opts: { socket: SendableSocket | null; dryRun: boolean },
): Promise<SendResult> {
  const plan = buildSendPlan(req);

  if (opts.dryRun) {
    log.info({ jid: plan.jid, content: plan.content }, "[dry-run] would sendMessage (no WhatsApp call)");
    return { ok: true, message_id: `dry-run:${Date.now()}` };
  }

  if (!opts.socket) {
    throw new Error("no live WhatsApp socket; cannot send");
  }

  const sent = await opts.socket.sendMessage(plan.jid, plan.content, plan.options);
  const messageId = sent?.key?.id ?? "";
  log.info({ jid: plan.jid, messageId }, "sent message");
  return { ok: true, message_id: messageId };
}
