/**
 * Outbound HTTP server for the bridge.
 *
 * Endpoints (per the shared bridge /send contract):
 *   POST /send   — header `X-Bridge-Key: <BRIDGE_KEY>` required (else 401).
 *     Body:     { to, type: "text"|"reaction", text?, react_to_message_id?, reply_to_message_id? }
 *     Response: { ok, message_id }
 *   GET  /health — { ok: true, connected: <bool> }  (no auth)
 *
 * Built on node:http (no extra dependency). The request handler is exported
 * as a factory so it can be unit-tested with a mocked socket and an injected
 * sender, without binding a real port.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import pino from "pino";

import { send as defaultSend, SendValidationError, type SendableSocket } from "./sender.js";
import type { HealthResult, SendRequest, SendResult } from "./types.js";

const log = pino({ name: "server" });

/** Dependencies the HTTP handler needs; injectable for tests. */
export interface ServerDeps {
  /** Shared secret; requests must present it as `X-Bridge-Key`. */
  bridgeKey: string;
  /** When true, /send logs instead of sending. */
  dryRun: boolean;
  /** Accessor for the single live Baileys socket (null when disconnected). */
  getSocket: () => SendableSocket | null;
  /** Sender impl; defaults to the real one. Overridable in tests. */
  send?: typeof defaultSend;
}

/** Read the full request body as a UTF-8 string (capped to avoid abuse). */
function readBody(req: IncomingMessage, limitBytes = 256 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

/**
 * Build the node:http request handler. Pure-ish: all state comes from `deps`.
 */
export function createRequestHandler(deps: ServerDeps) {
  const sendImpl = deps.send ?? defaultSend;

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    // Strip any query string for routing.
    const path = (req.url ?? "/").split("?")[0];

    // --- GET /health (no auth) -------------------------------------------
    if (method === "GET" && path === "/health") {
      const body: HealthResult = { ok: true, connected: deps.getSocket() !== null };
      sendJson(res, 200, body);
      return;
    }

    // --- POST /send (auth required) --------------------------------------
    if (method === "POST" && path === "/send") {
      const key = req.headers["x-bridge-key"];
      if (typeof key !== "string" || key === "" || key !== deps.bridgeKey) {
        sendJson(res, 401, { ok: false, error: "invalid or missing X-Bridge-Key" });
        return;
      }

      let parsed: SendRequest;
      try {
        const raw = await readBody(req);
        parsed = JSON.parse(raw) as SendRequest;
      } catch {
        sendJson(res, 400, { ok: false, error: "invalid JSON body" });
        return;
      }

      try {
        const result: SendResult = await sendImpl(parsed, {
          socket: deps.getSocket(),
          dryRun: deps.dryRun,
        });
        sendJson(res, 200, result);
      } catch (err) {
        if (err instanceof SendValidationError) {
          sendJson(res, 400, { ok: false, error: err.message });
          return;
        }
        log.error({ err }, "send failed");
        sendJson(res, 502, { ok: false, error: "send failed" });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: "not found" });
  };
}

/** Create and start the HTTP server. Returns the node Server. */
export function startServer(deps: ServerDeps, port: number): Server {
  const handler = createRequestHandler(deps);
  const server = createServer((req, res) => {
    handler(req, res).catch((err) => {
      log.error({ err }, "unhandled request error");
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: "internal error" });
    });
  });
  server.listen(port, () => {
    log.info({ port }, "bridge HTTP server listening (POST /send, GET /health)");
  });
  return server;
}
