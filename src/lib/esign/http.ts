import "server-only";
import { errorStatus } from "./errors";

/** RFC 6266 Content-Disposition with an ASCII fallback and a UTF-8 name. */
function disposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "document.pdf";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Stream a PDF privately: never cached, never sniffed, never framed. */
export function pdfResponse(bytes: Uint8Array, name: string, download: boolean): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": disposition(download ? "attachment" : "inline", name),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "default-src 'none'; object-src 'self'; style-src 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'",
    },
  });
}

/** Plain-text error page for document links (opened in a new tab). */
export function textError(err: unknown): Response {
  const status = errorStatus(err);
  const message = status === 500 ? "Something went wrong. Please try again." : (err as Error).message;
  if (status === 500) console.error("[esign] document route", err);
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
