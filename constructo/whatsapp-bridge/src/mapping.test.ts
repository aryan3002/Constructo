import { describe, expect, it } from "vitest";

import { classifyContent, isGroupJid, timestampToIso, toRawMessage, type WAMessage } from "./mapping.js";

const GROUP_JID = "120363011111111111@g.us";
const DM_JID = "15551230000@s.whatsapp.net";
const SENDER_JID = "15559990000@s.whatsapp.net";
const TS = 1716800000; // fixed unix seconds

/** Build a minimal group WAMessage with the given proto message content. */
function groupMsg(
  message: WAMessage["message"],
  overrides: Partial<WAMessage> = {},
): WAMessage {
  return {
    key: {
      remoteJid: GROUP_JID,
      fromMe: false,
      id: "MSGID123",
      participant: SENDER_JID,
    },
    pushName: "Foreman Joe",
    messageTimestamp: TS,
    message,
    ...overrides,
  } as WAMessage;
}

describe("isGroupJid", () => {
  it("true for @g.us", () => expect(isGroupJid(GROUP_JID)).toBe(true));
  it("false for DM", () => expect(isGroupJid(DM_JID)).toBe(false));
  it("false for null/undefined", () => {
    expect(isGroupJid(null)).toBe(false);
    expect(isGroupJid(undefined)).toBe(false);
  });
});

describe("timestampToIso", () => {
  it("converts unix seconds to ISO8601", () => {
    expect(timestampToIso(TS)).toBe(new Date(TS * 1000).toISOString());
  });
  it("handles string timestamps", () => {
    expect(timestampToIso(String(TS))).toBe(new Date(TS * 1000).toISOString());
  });
  it("handles Long-like objects", () => {
    expect(timestampToIso({ toNumber: () => TS })).toBe(new Date(TS * 1000).toISOString());
  });
  it("falls back to now() for missing/invalid", () => {
    const iso = timestampToIso(null);
    expect(() => new Date(iso).toISOString()).not.toThrow();
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });
});

describe("toRawMessage - text", () => {
  it("maps a plain conversation message", () => {
    const out = toRawMessage(groupMsg({ conversation: "Concrete poured on level 3" }));
    expect(out).not.toBeNull();
    expect(out).toMatchObject({
      source: "baileys",
      external_group_id: GROUP_JID,
      sender_id: SENDER_JID,
      sender_name: "Foreman Joe",
      media_type: "text",
      text: "Concrete poured on level 3",
      media_url: null,
      media_mime: null,
      sent_at: new Date(TS * 1000).toISOString(),
    });
    expect(out?.raw).toBeTypeOf("object");
  });

  it("maps an extendedTextMessage", () => {
    const out = toRawMessage(
      groupMsg({ extendedTextMessage: { text: "See attached drawing" } }),
    );
    expect(out?.media_type).toBe("text");
    expect(out?.text).toBe("See attached drawing");
  });
});

describe("toRawMessage - image with caption", () => {
  it("maps imageMessage, captures caption and mime", () => {
    const out = toRawMessage(
      groupMsg({
        imageMessage: {
          caption: "Rebar inspection",
          mimetype: "image/jpeg",
          url: "https://mmg.whatsapp.net/x",
          mediaKey: new Uint8Array([1, 2, 3]),
        },
      }),
    );
    expect(out?.media_type).toBe("image");
    expect(out?.text).toBe("Rebar inspection");
    expect(out?.media_mime).toBe("image/jpeg");
    // media_url filled by index.ts after download, null at mapping time.
    expect(out?.media_url).toBeNull();
  });
});

describe("toRawMessage - voice / ptt", () => {
  it("maps audioMessage to voice", () => {
    const out = toRawMessage(
      groupMsg({
        audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true },
      }),
    );
    expect(out?.media_type).toBe("voice");
    expect(out?.text).toBeNull();
    expect(out?.media_mime).toBe("audio/ogg; codecs=opus");
  });
});

describe("toRawMessage - document", () => {
  it("maps documentMessage with caption + mime", () => {
    const out = toRawMessage(
      groupMsg({
        documentMessage: {
          fileName: "PO-1042.pdf",
          mimetype: "application/pdf",
          caption: "Purchase order",
        },
      }),
    );
    expect(out?.media_type).toBe("document");
    expect(out?.media_mime).toBe("application/pdf");
    expect(out?.text).toBe("Purchase order");
  });
});

describe("toRawMessage - video", () => {
  it("maps videoMessage", () => {
    const out = toRawMessage(
      groupMsg({ videoMessage: { mimetype: "video/mp4", caption: "Crane lift" } }),
    );
    expect(out?.media_type).toBe("video");
    expect(out?.media_mime).toBe("video/mp4");
    expect(out?.text).toBe("Crane lift");
  });
});

describe("toRawMessage - null cases", () => {
  it("returns null for a 1:1 (non-group) message", () => {
    const dm = groupMsg(
      { conversation: "hi" },
      { key: { remoteJid: DM_JID, fromMe: false, id: "x" } },
    );
    expect(toRawMessage(dm)).toBeNull();
  });

  it("returns null for fromMe messages", () => {
    const mine = groupMsg(
      { conversation: "my own message" },
      {
        key: { remoteJid: GROUP_JID, fromMe: true, id: "x", participant: SENDER_JID },
      },
    );
    expect(toRawMessage(mine)).toBeNull();
  });

  it("returns null when remoteJid is missing", () => {
    const noJid = groupMsg({ conversation: "hi" }, { key: { fromMe: false, id: "x" } });
    expect(toRawMessage(noJid)).toBeNull();
  });

  it("returns null for unsupported content (reaction)", () => {
    const reaction = groupMsg({
      reactionMessage: { key: { id: "y" }, text: "👍" },
    });
    expect(toRawMessage(reaction)).toBeNull();
  });

  it("returns null for a protocol message", () => {
    const proto = groupMsg({ protocolMessage: { type: 0 } });
    expect(toRawMessage(proto)).toBeNull();
  });

  it("returns null for empty message content", () => {
    expect(toRawMessage(groupMsg(null))).toBeNull();
    expect(toRawMessage(groupMsg(undefined))).toBeNull();
  });

  it("uses pushName null when absent", () => {
    const out = toRawMessage(
      groupMsg({ conversation: "hi" }, { pushName: undefined }),
    );
    expect(out?.sender_name).toBeNull();
  });
});

describe("classifyContent unwrapping", () => {
  it("unwraps ephemeralMessage", () => {
    const info = classifyContent({
      ephemeralMessage: { message: { conversation: "disappearing text" } },
    });
    expect(info?.mediaType).toBe("text");
    expect(info?.text).toBe("disappearing text");
  });

  it("unwraps viewOnceMessageV2", () => {
    const info = classifyContent({
      viewOnceMessageV2: {
        message: { imageMessage: { mimetype: "image/jpeg", caption: "once" } },
      },
    });
    expect(info?.mediaType).toBe("image");
    expect(info?.mediaMime).toBe("image/jpeg");
  });
});
