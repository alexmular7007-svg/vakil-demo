import "server-only";
import { AiProviderError, AiUnavailableError, FairUseLimitError } from "@/lib/ai/errors";
import type { ChatErrorCode, ChatStreamEvent } from "./types";

/** Largest JSON body POST /api/chat accepts (an 8,000-character question in any script fits easily). */
export const MAX_CHAT_BODY_BYTES = 64 * 1024;

type ErrorEvent = Extract<ChatStreamEvent, { t: "error" }>;

/** The one mapping from an error to what the user sees: safe message, code and retry hint. */
export function chatErrorEvent(err: unknown): ErrorEvent {
  if (err instanceof FairUseLimitError) return { t: "error", code: "fair_use", message: err.message, retryable: false };
  if (err instanceof AiUnavailableError) return { t: "error", code: "unavailable", message: err.message, retryable: false };
  if (err instanceof AiProviderError) return { t: "error", code: "provider", message: err.message, retryable: err.retryable };
  return { t: "error", code: "internal", message: "Something went wrong while answering. Please try again.", retryable: false };
}

/** JSON error for failures before the stream starts; same fields as the stream's error event. */
export function chatErrorResponse(status: number, message: string, code: ChatErrorCode, opts: { retryable?: boolean; headers?: HeadersInit } = {}) {
  return Response.json(
    { error: message, code, retryable: opts.retryable ?? false },
    { status, headers: { "Cache-Control": "no-store", ...opts.headers } },
  );
}

export type JsonBody = { ok: true; value: unknown } | { ok: false; status: 400 | 413 | 415; error: string };

/**
 * Reads a JSON request body without trusting Content-Length: stops reading and
 * refuses once `maxBytes` is exceeded. Only application/json is accepted, which
 * also keeps simple cross-site form posts out.
 */
export async function readJsonBody(req: Request, maxBytes = MAX_CHAT_BODY_BYTES): Promise<JsonBody> {
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) {
    return { ok: false, status: 415, error: "Send the request as JSON." };
  }
  const tooLarge = { ok: false, status: 413, error: "The request is too large." } as const;
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge;
  if (!req.body) return { ok: false, status: 400, error: "Invalid request" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return tooLarge;
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "Invalid request" };
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: "Invalid request" };
  }
}

export type NdjsonIO = {
  /** Sends one event; false (and a no-op) once the client has gone. */
  send: (e: ChatStreamEvent) => boolean;
  /** Fires when the client disconnects or cancels the response. */
  signal: AbortSignal;
};

/**
 * An NDJSON response body for the chat stream. `run` writes events through
 * `send`; whatever it throws becomes exactly one `error` event (see
 * chatErrorEvent) and the stream always closes. A client abort (request signal
 * or a cancelled body) aborts `signal`, so `run` can stop the model and clean up;
 * nothing is written after that.
 */
export function ndjsonStream(
  run: (io: NdjsonIO) => Promise<void>,
  opts: { signal?: AbortSignal; onError?: (err: unknown) => void } = {},
): ReadableStream<Uint8Array> {
  const abort = new AbortController();
  const encoder = new TextEncoder();
  const onParentAbort = () => abort.abort();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      if (opts.signal?.aborted) abort.abort();
      else opts.signal?.addEventListener("abort", onParentAbort, { once: true });

      const send = (e: ChatStreamEvent) => {
        if (closed || abort.signal.aborted) return false;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
          return true;
        } catch {
          closed = true;
          return false;
        }
      };

      try {
        await run({ send, signal: abort.signal });
      } catch (err) {
        opts.onError?.(err);
        send(chatErrorEvent(err));
      } finally {
        opts.signal?.removeEventListener("abort", onParentAbort);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed or errored by the runtime
          }
        }
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
}
