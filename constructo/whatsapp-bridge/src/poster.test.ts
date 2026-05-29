import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingestUrl, postRawMessage } from "./poster.js";
import type { RawMessagePayload } from "./types.js";

const samplePayload: RawMessagePayload = {
  source: "baileys",
  external_group_id: "120363011111111111@g.us",
  sender_id: "15559990000@s.whatsapp.net",
  sender_name: "Foreman Joe",
  media_type: "text",
  text: "Concrete poured on level 3",
  media_url: null,
  media_mime: null,
  sent_at: "2024-05-27T10:13:20.000Z",
  raw: { key: { id: "MSGID123" } },
};

describe("ingestUrl", () => {
  it("appends the ingest path", () => {
    expect(ingestUrl("http://localhost:8000")).toBe("http://localhost:8000/api/v1/ingest");
  });
  it("tolerates a trailing slash", () => {
    expect(ingestUrl("http://localhost:8000/")).toBe("http://localhost:8000/api/v1/ingest");
  });
});

describe("postRawMessage - dry run", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does NOT call fetch and returns a dryRun result", async () => {
    const result = await postRawMessage(samplePayload, {
      backendUrl: "http://localhost:8000",
      apiKey: "dev-ingest-key",
      dryRun: true,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, status: 0, dryRun: true });
  });
});

describe("postRawMessage - normal mode", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "uuid-from-backend" }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls fetch with correct URL, method, X-Ingest-Key header, and JSON body", async () => {
    const result = await postRawMessage(samplePayload, {
      backendUrl: "http://localhost:8000",
      apiKey: "secret-key-123",
      dryRun: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/ingest");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Ingest-Key"]).toBe("secret-key-123");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toMatchObject({
      source: "baileys",
      external_group_id: samplePayload.external_group_id,
      media_type: "text",
    });

    expect(result).toMatchObject({ ok: true, status: 200, id: "uuid-from-backend", dryRun: false });
  });

  it("returns ok:false on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "invalid key",
    });
    const result = await postRawMessage(samplePayload, {
      backendUrl: "http://localhost:8000",
      apiKey: "wrong",
      dryRun: false,
    });
    expect(result).toMatchObject({ ok: false, status: 401, dryRun: false });
  });
});
