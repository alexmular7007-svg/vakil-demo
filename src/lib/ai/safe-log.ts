// Privacy-safe error logging for the AI pipeline. Error messages can carry the
// user's question, document text or answer (database errors include query
// parameters; provider errors can echo input), so logs get the error's type,
// codes and where it was thrown, never its message.

type Loose = {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  kind?: unknown;
  type?: unknown;
  requestID?: unknown;
  cause?: { name?: unknown; code?: unknown };
  stack?: unknown;
};

const SAFE_VALUE = /^[\w.:-]{1,64}$/;

function safe(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && SAFE_VALUE.test(v)) return v;
  return null;
}

/** "DrizzleQueryError code=42P01 cause=PostgresError at withUser (src/lib/db/index.ts:52:7)" */
export function errorSummary(err: unknown): string {
  if (err === null || typeof err !== "object") return typeof err;
  const e = err as Loose;
  const name = safe(e.name) ?? (err as object).constructor?.name ?? "Error";
  const parts = [name];
  for (const key of ["kind", "status", "code", "type", "requestID"] as const) {
    const v = safe(e[key]);
    if (v) parts.push(`${key}=${v}`);
  }
  const causeName = safe(e.cause?.name);
  const causeCode = safe(e.cause?.code);
  if (causeName || causeCode) parts.push(`cause=${[causeName, causeCode].filter(Boolean).join(":")}`);
  if (typeof e.stack === "string") {
    const frame = e.stack.split("\n").find((l) => l.trim().startsWith("at "));
    if (frame) parts.push(frame.trim().replace(/\s+/g, " ").slice(0, 200));
  }
  return parts.join(" ");
}

/** console.error without message content: `[scope] what: <summary>` plus optional safe fields. */
export function logAiError(scope: string, what: string, err: unknown, fields?: Record<string, string | number | boolean | null | undefined>) {
  const extra = fields
    ? Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")
    : "";
  console.error(`[${scope}] ${what}: ${errorSummary(err)}${extra ? ` (${extra})` : ""}`);
}
