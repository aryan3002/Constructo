import { describe, expect, it, vi } from "vitest";

import {
  buildSendPlan,
  DEFAULT_REACTION,
  send,
  SendValidationError,
  type SendableSocket,
} from "./sender.js";
import type { SendRequest } from "./types.js";

const GROUP = "120363011111111111@g.us";

describe("buildSendPlan - text", () => {
  it("maps a text request to { text }", () => {
    const plan = buildSendPlan({ to: GROUP, type: "text", text: "Bricks delivered" });
    expect(plan.jid).toBe(GROUP);
    expect(plan.content).toEqual({ text: "Bricks delivered" });
    expect(plan.options.quoted).toBeUndefined();
  });

  it("attaches a quoted stub when reply_to_message_id is set", () => {
    const plan = buildSendPlan({
      to: GROUP,
      type: "text",
      text: "On it",
      reply_to_message_id: "ORIGID9",
    });
    expect(plan.content).toEqual({ text: "On it" });
    expect(plan.options.quoted?.key).toMatchObject({ remoteJid: GROUP, id: "ORIGID9" });
  });

  it("rejects empty/missing text", () => {
    expect(() => buildSendPlan({ to: GROUP, type: "text" } as SendRequest)).toThrow(
      SendValidationError,
    );
    expect(() => buildSendPlan({ to: GROUP, type: "text", text: "" })).toThrow(SendValidationError);
  });
});

describe("buildSendPlan - reaction", () => {
  it("maps to { react: { text, key } } with the message key", () => {
    const plan = buildSendPlan({
      to: GROUP,
      type: "reaction",
      react_to_message_id: "MSG42",
      text: "👍",
    });
    expect(plan.content).toEqual({
      react: { text: "👍", key: { remoteJid: GROUP, id: "MSG42", fromMe: false } },
    });
  });

  it("defaults to the ✅ emoji when text is omitted", () => {
    const plan = buildSendPlan({ to: GROUP, type: "reaction", react_to_message_id: "MSG42" });
    expect(plan.content).toEqual({
      react: { text: DEFAULT_REACTION, key: { remoteJid: GROUP, id: "MSG42", fromMe: false } },
    });
  });

  it("rejects a reaction with no react_to_message_id", () => {
    expect(() => buildSendPlan({ to: GROUP, type: "reaction" })).toThrow(SendValidationError);
  });
});

describe("buildSendPlan - validation", () => {
  it("rejects a missing/blank `to`", () => {
    expect(() => buildSendPlan({ type: "text", text: "x" } as SendRequest)).toThrow(
      SendValidationError,
    );
    expect(() => buildSendPlan({ to: "  ", type: "text", text: "x" })).toThrow(SendValidationError);
  });

  it("rejects an unsupported type", () => {
    expect(() => buildSendPlan({ to: GROUP, type: "sticker" } as unknown as SendRequest)).toThrow(
      SendValidationError,
    );
  });
});

describe("send - socket vs dry-run", () => {
  it("calls sock.sendMessage with the mapped plan and returns the WA message id", async () => {
    const sendMessage = vi.fn(async () => ({ key: { id: "WA-OUT-1" } }));
    const socket = { sendMessage } as unknown as SendableSocket;

    const req: SendRequest = { to: GROUP, type: "text", text: "hi" };
    const result = await send(req, { socket, dryRun: false });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [jid, content, options] = sendMessage.mock.calls[0] as unknown as [string, unknown, unknown];
    expect(jid).toBe(GROUP);
    expect(content).toEqual({ text: "hi" });
    expect(options).toEqual({});
    expect(result).toEqual({ ok: true, message_id: "WA-OUT-1" });
  });

  it("passes the reaction payload through to sendMessage", async () => {
    const sendMessage = vi.fn(async () => ({ key: { id: "WA-OUT-2" } }));
    const socket = { sendMessage } as unknown as SendableSocket;

    await send({ to: GROUP, type: "reaction", react_to_message_id: "M1" }, { socket, dryRun: false });

    const [, content] = sendMessage.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(content).toEqual({
      react: { text: DEFAULT_REACTION, key: { remoteJid: GROUP, id: "M1", fromMe: false } },
    });
  });

  it("in dry-run does NOT call sendMessage and returns a dry-run id", async () => {
    const sendMessage = vi.fn();
    const socket = { sendMessage } as unknown as SendableSocket;

    const result = await send({ to: GROUP, type: "text", text: "hi" }, { socket, dryRun: true });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.message_id).toMatch(/^dry-run:/);
  });

  it("throws when no socket is present and not dry-run", async () => {
    await expect(
      send({ to: GROUP, type: "text", text: "hi" }, { socket: null, dryRun: false }),
    ).rejects.toThrow(/no live WhatsApp socket/);
  });
});
