import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type SendableSocket } from "./sender.js";
import { startServer, type ServerDeps } from "./server.js";

const GROUP = "120363011111111111@g.us";
const KEY = "test-bridge-key";

let server: ReturnType<typeof startServer>;
let baseUrl: string;

function listen(deps: ServerDeps): Promise<void> {
  return new Promise((resolve) => {
    // port 0 => OS picks a free ephemeral port.
    server = startServer(deps, 0);
    server.on("listening", () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

afterEach(() => {
  server?.close();
  vi.restoreAllMocks();
});

describe("GET /health", () => {
  it("reports connected:false when there is no socket", async () => {
    await listen({ bridgeKey: KEY, dryRun: false, getSocket: () => null });
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, connected: false });
  });

  it("reports connected:true when a socket is present", async () => {
    const socket = { sendMessage: vi.fn() } as unknown as SendableSocket;
    await listen({ bridgeKey: KEY, dryRun: false, getSocket: () => socket });
    const res = await fetch(`${baseUrl}/health`);
    expect(await res.json()).toEqual({ ok: true, connected: true });
  });
});

describe("POST /send - auth", () => {
  beforeEach(async () => {
    await listen({ bridgeKey: KEY, dryRun: true, getSocket: () => null });
  });

  it("401s when the X-Bridge-Key header is missing", async () => {
    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: GROUP, type: "text", text: "hi" }),
    });
    expect(res.status).toBe(401);
  });

  it("401s when the X-Bridge-Key header is wrong", async () => {
    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Key": "nope" },
      body: JSON.stringify({ to: GROUP, type: "text", text: "hi" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /send - dry-run logs, does not send", () => {
  it("returns ok with a dry-run id and never touches the socket", async () => {
    const sendMessage = vi.fn();
    const socket = { sendMessage } as unknown as SendableSocket;
    await listen({ bridgeKey: KEY, dryRun: true, getSocket: () => socket });

    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Key": KEY },
      body: JSON.stringify({ to: GROUP, type: "text", text: "hi" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message_id: string };
    expect(body.ok).toBe(true);
    expect(body.message_id).toMatch(/^dry-run:/);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("POST /send - text and reaction mapping to Baileys", () => {
  it("text: calls sendMessage(jid,{text}) and echoes the WA message id", async () => {
    const sendMessage = vi.fn(async () => ({ key: { id: "WA-OUT-99" } }));
    const socket = { sendMessage } as unknown as SendableSocket;
    await listen({ bridgeKey: KEY, dryRun: false, getSocket: () => socket });

    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Key": KEY },
      body: JSON.stringify({ to: GROUP, type: "text", text: "Pour done" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message_id: "WA-OUT-99" });
    const [jid, content] = sendMessage.mock.calls[0] as unknown as [string, unknown];
    expect(jid).toBe(GROUP);
    expect(content).toEqual({ text: "Pour done" });
  });

  it("reaction: calls sendMessage with a react payload", async () => {
    const sendMessage = vi.fn(async () => ({ key: { id: "WA-OUT-100" } }));
    const socket = { sendMessage } as unknown as SendableSocket;
    await listen({ bridgeKey: KEY, dryRun: false, getSocket: () => socket });

    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Key": KEY },
      body: JSON.stringify({ to: GROUP, type: "reaction", react_to_message_id: "M7", text: "👍" }),
    });

    expect(res.status).toBe(200);
    const [, content] = sendMessage.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(content).toEqual({
      react: { text: "👍", key: { remoteJid: GROUP, id: "M7", fromMe: false } },
    });
  });
});

describe("POST /send - bad input", () => {
  beforeEach(async () => {
    await listen({ bridgeKey: KEY, dryRun: true, getSocket: () => null });
  });

  it("400s on invalid JSON", async () => {
    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Key": KEY },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("400s on a validation error (missing text)", async () => {
    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Key": KEY },
      body: JSON.stringify({ to: GROUP, type: "text" }),
    });
    expect(res.status).toBe(400);
  });

  it("502s when no socket and not dry-run", async () => {
    server?.close();
    await listen({ bridgeKey: KEY, dryRun: false, getSocket: () => null });
    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Key": KEY },
      body: JSON.stringify({ to: GROUP, type: "text", text: "hi" }),
    });
    expect(res.status).toBe(502);
  });
});
