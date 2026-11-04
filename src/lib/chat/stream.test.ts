import { describe, expect, it, vi } from "vitest";
import { AiProviderError, FairUseLimitError } from "@/lib/ai/errors";
import { chatErrorEvent, chatErrorResponse, ndjsonStream, readJsonBody } from "./stream";
import type { ChatStreamEvent } from "./types";

const post = (body: BodyInit | null, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/chat", { method: "POST", body, headers, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);

async function lines(stream: ReadableStream<Uint8Array>): Promise<ChatStreamEvent[]> {
  const text = await new Response(stream).text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ChatStreamEvent);
}

describe("readJsonBody", () => {
  it("parses a JSON body", async () => {
    expect(await readJsonBody(post(JSON.stringify({ message: "hi" })))).toEqual({ ok: true, value: { message: "hi" } });
  });

  it("refuses other content types (keeps simple cross-site form posts out)", async () => {
    expect(await readJsonBody(post("message=hi", { "content-type": "application/x-www-form-urlencoded" }))).toMatchObject({ ok: false, status: 415 });
    expect(await readJsonBody(post("{}", { "content-type": "text/plain" }))).toMatchObject({ ok: false, status: 415 });
  });

  it("refuses bodies over the limit by declared length and while reading", async () => {
    expect(await readJsonBody(post("{}", { "content-type": "application/json", "content-length": "999999" }), 100)).toMatchObject({ ok: false, status: 413 });
    const big = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 10; i++) c.enqueue(new TextEncoder().encode("x".repeat(50)));
        c.close();
      },
    });
    expect(await readJsonBody(post(big), 100)).toMatchObject({ ok: false, status: 413 });
  });

  it("refuses broken JSON and invalid UTF-8", async () => {
    expect(await readJsonBody(post("{nope"))).toMatchObject({ ok: false, status: 400 });
    expect(await readJsonBody(post(new Uint8Array([0x7b, 0xff, 0x7d])))).toMatchObject({ ok: false, status: 400 });
  });
});

describe("chat errors", () => {
  it("maps gateway errors to codes and safe messages", () => {
    expect(chatErrorEvent(new FairUseLimitError(15))).toMatchObject({ t: "error", code: "fair_use", retryable: false });
    expect(chatErrorEvent(new AiProviderError("busy", true, "rate_limit"))).toEqual({ t: "error", code: "provider", message: "busy", retryable: true });
    const internal = chatErrorEvent(new Error("Failed query: insert into messages … params: my client's secret"));
    expect(internal).toMatchObject({ code: "internal", message: "Something went wrong while answering. Please try again." });
    expect(internal.message).not.toMatch(/secret/);
  });

  it("uses the same fields for JSON errors before the stream", async () => {
    const res = chatErrorResponse(429, "Slow down.", "rate_limit", { retryable: true, headers: { "Retry-After": "5" } });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(await res.json()).toEqual({ error: "Slow down.", code: "rate_limit", retryable: true });
  });
});

describe("ndjsonStream", () => {
  it("writes one JSON event per line and closes", async () => {
    const s = ndjsonStream(async ({ send }) => {
      send({ t: "delta", v: "a" });
      send({ t: "delta", v: "b\nc" });
    });
    expect(await lines(s)).toEqual([
      { t: "delta", v: "a" },
      { t: "delta", v: "b\nc" },
    ]);
  });

  it("turns a thrown error into exactly one error event", async () => {
    const onError = vi.fn();
    const s = ndjsonStream(
      async ({ send }) => {
        send({ t: "delta", v: "partial" });
        throw new AiProviderError("The AI provider had a problem answering. Please try again.", true, "server");
      },
      { onError },
    );
    const ev = await lines(s);
    expect(ev).toEqual([
      { t: "delta", v: "partial" },
      { t: "error", code: "provider", message: "The AI provider had a problem answering. Please try again.", retryable: true },
    ]);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("aborts the run's signal when the client cancels, and stops writing", async () => {
    let signal: AbortSignal | undefined;
    let afterCancel: boolean | undefined;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const s = ndjsonStream(async (io) => {
      signal = io.signal;
      io.send({ t: "delta", v: "x" });
      await gate;
      afterCancel = io.send({ t: "delta", v: "y" });
    });
    const reader = s.getReader();
    await reader.read();
    await reader.cancel();
    release();
    await new Promise((r) => setTimeout(r, 5));
    expect(signal?.aborted).toBe(true);
    expect(afterCancel).toBe(false);
  });

  it("follows the request's abort signal", async () => {
    const ac = new AbortController();
    let seen: AbortSignal | undefined;
    const s = ndjsonStream(
      async ({ signal }) => {
        seen = signal;
        ac.abort();
      },
      { signal: ac.signal },
    );
    await lines(s);
    expect(seen?.aborted).toBe(true);
  });
});
