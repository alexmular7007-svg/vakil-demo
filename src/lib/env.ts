import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

// Optional tuning knobs: an empty value means "use the built-in default".
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalInt = (min: number, max: number) => z.preprocess(blank, z.coerce.number().int().min(min).max(max).optional());
const optionalTier = z.preprocess(blank, z.enum(["fast", "standard", "pro"]).optional());
const optionalEffort = z.preprocess(blank, z.enum(["low", "medium", "high", "xhigh", "max"]).optional());

const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined;

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default(process.env.APP_URL || vercelUrl || "http://localhost:3000"),

  // Database. Empty in local development: an embedded Postgres (PGlite) is used.
  DATABASE_URL: optional,
  PGLITE_DIR: z.string().default(".data/pglite"),

  // Auth. A long random string; required in production.
  BETTER_AUTH_SECRET: optional,

  // AI providers. Either key enables the assistant; both enable routing between them.
  ANTHROPIC_API_KEY: optional,
  GOOGLE_GENERATIVE_AI_API_KEY: optional,
  AI_PROVIDER: z.enum(["auto", "anthropic", "google"]).default("auto"),
  // Everything below is optional; defaults live in src/lib/ai/config.ts.
  // With AI_PROVIDER=auto and both keys, a failing provider fails over to the other one.
  AI_FAILOVER: z.preprocess(blank, z.enum(["true", "false"]).optional()),
  // Model ids per provider and tier.
  AI_MODEL_CLAUDE_FAST: optional,
  AI_MODEL_CLAUDE_STANDARD: optional,
  AI_MODEL_CLAUDE_PRO: optional,
  AI_MODEL_GEMINI_FAST: optional,
  AI_MODEL_GEMINI_STANDARD: optional,
  AI_MODEL_GEMINI_PRO: optional,
  // Older names for the Gemini overrides, still honoured.
  GEMINI_FAST_MODEL: optional,
  GEMINI_STANDARD_MODEL: optional,
  GEMINI_PRO_MODEL: optional,
  // Claude effort and output-token ceilings per tier.
  AI_EFFORT_FAST: optionalEffort,
  AI_EFFORT_STANDARD: optionalEffort,
  AI_EFFORT_PRO: optionalEffort,
  AI_MAX_TOKENS_FAST: optionalInt(256, 128_000),
  AI_MAX_TOKENS_STANDARD: optionalInt(256, 128_000),
  AI_MAX_TOKENS_PRO: optionalInt(256, 128_000),
  // Which tier each kind of chat request uses.
  AI_TIER_CHAT: optionalTier,
  AI_TIER_DEEP: optionalTier,
  AI_TIER_DRAFT: optionalTier,
  AI_TIER_TITLE: optionalTier,
  // Resilience: per-attempt inactivity timeout, overall deadline, retries, circuit breaker.
  AI_TIMEOUT_MS: optionalInt(1_000, 600_000),
  AI_DEADLINE_MS: optionalInt(1_000, 900_000),
  AI_MAX_RETRIES: optionalInt(0, 6),
  AI_RETRY_BASE_MS: optionalInt(10, 60_000),
  AI_RETRY_MAX_MS: optionalInt(10, 120_000),
  AI_BREAKER_THRESHOLD: optionalInt(1, 100),
  AI_BREAKER_COOLDOWN_MS: optionalInt(1_000, 3_600_000),
  // Retrieval and context budget.
  AI_RETRIEVAL_STATUTES: optionalInt(0, 20),
  AI_RETRIEVAL_JUDGMENTS: optionalInt(0, 20),
  AI_RETRIEVAL_DOCUMENTS: optionalInt(0, 20),
  AI_SOURCE_MAX_CHARS: optionalInt(200, 20_000),
  AI_CONTEXT_BUDGET_TOKENS: optionalInt(2_000, 1_000_000),
  AI_SOURCE_BUDGET_TOKENS: optionalInt(500, 500_000),
  AI_HISTORY_MESSAGES: optionalInt(0, 100),

  // Admins must have two-factor login switched on to use the admin console.
  // Defaults to on in production and off in development.
  ADMIN_REQUIRE_2FA: z.enum(["true", "false"]).optional(),

  // Sign in with Google (OAuth client from Google Cloud Console). Both enable the button.
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  // Email: Resend (API) or any SMTP server, e.g. Gmail with an app password
  // (SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=you@gmail.com, SMTP_PASS=<app password>).
  // Without either, emails are written to the dev outbox (development only).
  RESEND_API_KEY: optional,
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  EMAIL_FROM: z.string().default("Vaakil AI <no-reply@vaakil.com>"),

  // Files
  FILE_STORAGE_DIR: z.string().default(".data/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(50).default(15),

  // CGPEY (KYC + payments). Keys never leave the server.
  CGPEY_BASE_URL: z.string().url().default("https://api.cgpey.com"),
  // Pay-in (collections) host from CGPEY's pay-in docs; KYC uses CGPEY_BASE_URL.
  CGPEY_PAYIN_BASE_URL: z.string().url().default("https://lamda.cgpey.com"),
  CGPEY_MERCHANT_ID: optional,
  CGPEY_API_KEY: optional,
  CGPEY_API_SECRET: optional,
  CGPEY_WEBHOOK_SECRET: optional,

  // Licensed Aadhaar eSign aggregator (Leegality, Digio, SignDesk, emSigner, Zoho Sign, Setu...)
  ESIGN_PROVIDER: z.enum(["none", "leegality", "digio", "signdesk", "emsigner", "zoho", "setu"]).default("none"),
  ESIGN_API_KEY: optional,
  ESIGN_WEBHOOK_SECRET: optional,

  // Read-only access to the search.vaakil.com company directory (Supabase REST).
  DIRECTORY_SUPABASE_URL: optional,
  DIRECTORY_SUPABASE_KEY: optional,

  // Legal updates. CRON_SECRET guards /api/cron/updates (Vercel Cron sends it as a
  // Bearer token). EXTRA_UPDATE_FEEDS: comma-separated RSS/Atom URLs to watch as well.
  // DISABLED_UPDATE_SOURCES: comma-separated source keys to skip without a code change
  // (e.g. "prs-billtrack,india_code"; "extra:*" matches every extra feed). Only switches off.
  CRON_SECRET: optional,
  EXTRA_UPDATE_FEEDS: optional,
  DISABLED_UPDATE_SOURCES: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
}

const raw = parsed.data;

if (raw.NODE_ENV === "production" && !raw.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET must be set in production.");
}

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === "production",
  isDev: raw.NODE_ENV === "development",
  // Development-only fallback so the app runs out of the box; never used in production.
  authSecret: raw.BETTER_AUTH_SECRET ?? "dev-only-insecure-secret-change-me-0123456789abcdef",
  adminRequires2fa: raw.ADMIN_REQUIRE_2FA ? raw.ADMIN_REQUIRE_2FA === "true" : raw.NODE_ENV === "production",
};

export const features = {
  ai: Boolean(raw.ANTHROPIC_API_KEY || raw.GOOGLE_GENERATIVE_AI_API_KEY),
  anthropic: Boolean(raw.ANTHROPIC_API_KEY),
  google: Boolean(raw.GOOGLE_GENERATIVE_AI_API_KEY),
  email: Boolean(raw.RESEND_API_KEY || (raw.SMTP_HOST && raw.SMTP_USER && raw.SMTP_PASS)),
  smtp: Boolean(raw.SMTP_HOST && raw.SMTP_USER && raw.SMTP_PASS),
  googleSignIn: Boolean(raw.GOOGLE_CLIENT_ID && raw.GOOGLE_CLIENT_SECRET),
  cgpeyKyc: Boolean(raw.CGPEY_MERCHANT_ID && raw.CGPEY_API_KEY && raw.CGPEY_API_SECRET),
  cgpeyPayments: Boolean(raw.CGPEY_API_KEY && raw.CGPEY_API_SECRET && raw.CGPEY_WEBHOOK_SECRET),
  aadhaarEsign: raw.ESIGN_PROVIDER !== "none" && Boolean(raw.ESIGN_API_KEY),
  directory: Boolean(raw.DIRECTORY_SUPABASE_URL && raw.DIRECTORY_SUPABASE_KEY),
  updatesCron: Boolean(raw.CRON_SECRET),
};
