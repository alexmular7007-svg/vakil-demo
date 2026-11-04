# Vaakil AI

Legal AI workspace for Indian advocates: citation-checked research, Indian-format drafting, document review, multi-party e-sign, a case diary, clients and fee book, legal calculators, verified-advocate hand-off, and company lookup, in English and Hindi. Designed like a banking app: navy-and-brass identity, a "Today's board" home screen, bottom tab bar on phones, installable with offline reading. Built to become the AI layer of [vaakil.com](https://www.vaakil.com).

> Positioning: a **legal AI assistant for advocates** that provides legal information and drafting help. It is not a law firm and does not give legal advice (Advocates Act 1961; Bar Council of India Rule 36).

## Quick start (local)

**Windows:** see [START-HERE-WINDOWS.md](START-HERE-WINDOWS.md), or just double-click `start-windows.bat`.

**Any system (Windows PowerShell, macOS, Linux)** with Node.js 22 or 24:

```bash
npm install
npm run setup     # one time: .env.local, local PostgreSQL, tables, security rules, templates, bare acts
npm run local     # every time: starts PostgreSQL + the app at http://localhost:3000
npm run local:prod  # optional: production build (faster pages, offline mode, app install)
```

`npm run setup` prints a local admin email and password (also saved in `.env.local`). Add `ANTHROPIC_API_KEY` and/or `GOOGLE_GENERATIVE_AI_API_KEY` to `.env.local` to switch on AI. In development, emails (verification, one-time codes, signing links) appear at **/dev/outbox** instead of being sent. Feature list: [FEATURES.md](FEATURES.md).

## What works without any keys

| Feature | Without keys | Needs |
|---|---|---|
| Sign-up, login, 2FA, sessions, roles | ✅ | Resend key or SMTP (e.g. Gmail app password) to send real emails; Google OAuth client for "Continue with Google" |
| Matters, documents (upload + text extraction), drafting templates, DOCX export | ✅ | — |
| Bare acts search, IPC ↔ BNS by offence date | ✅ (after `db:seed`) | — |
| E-sign: sender / receiver / lawyer, email OTP, audit chain, certificate | ✅ (Tier-2 electronic signature) | Aggregator key for Aadhaar eSign |
| Ask AI, AI drafting, document summary / risk review / compare | Shows "not configured" | `ANTHROPIC_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` |
| Payments (subscriptions) | Shows "not configured" | CGPEY pay-in keys + webhook secret (or swap in Razorpay/Cashfree) |
| CGPEY KYC tester (PAN, bank, Aadhaar OTP) | Disabled | CGPEY merchant id + key + secret |
| Company directory (search.vaakil.com data) | Shows "not connected" | Directory Supabase URL + key (read-only) |

## Architecture

- **Next.js 16.4** App Router with Cache Components, React 19.3, TypeScript, Tailwind CSS 4. Public pages (home, pricing, templates, bare acts, legal pages) are static and SEO-friendly; the workspace at `/app` streams per user.
- **PostgreSQL** via Drizzle ORM. Schemas: `app` (users, matters, documents, chats, drafts, advocates), `ai` (assistants, prompts, usage), `esign`, `billing`, `privacy`, `audit`, `corpus`.
- **Auth**: Better Auth (email + password, TOTP two-factor, admin roles, rate-limited endpoints).
- **AI gateway** (`src/lib/ai/gateway.ts`): official Anthropic SDK (Claude Haiku 5.5 / Sonnet 5.5 / Opus 5.5) and Google GenAI SDK (Gemini Flash-Lite / Flash / Pro), routed by tier, with fair-use limits, cost tracking and server-side refusal fallback on Claude.
- **Retrieval + citation check** (`src/lib/ai/retrieval.ts`, `citations.ts`): answers are written from retrieved bare-act sections and the user's own documents; every `[S#]` marker, statute reference and case citation is checked before display and badged verified / not in corpus / unverified.
- **Files**: magic-byte validation, size limits, private storage (`src/lib/files`). Local disk in development; swap for Supabase Storage private buckets in production.

## Security model ("nobody can just change the data")

1. **Identity only from the verified session.** Every page, server action and route handler re-checks the session (`src/lib/auth/dal.ts`); user ids are never taken from the browser.
2. **Row-level security in Postgres.** User queries run inside `withUser()`, which switches to the non-owner `app_user` role; policies in `src/lib/db/sql/security.sql` restrict every row to its owner. Advocates cannot mark themselves verified (column privileges revoked).
3. **Tamper-evident records.** `audit.events`, `esign.events` and `app.draft_versions` are hash-chained and append-only (update/delete blocked by triggers). Envelope document hashes freeze when locked; completed envelopes cannot change state. `verifyAuditChain()` re-walks the chain.
4. **Keys stay on the server.** AI, payment, KYC and e-sign keys are read only in `server-only` modules.
5. **Headers and limits.** CSP, HSTS, `X-Frame-Options: DENY`, nosniff, referrer and permissions policies (`next.config.ts`); Postgres-backed rate limits on chat, uploads, OTP and auth.
6. **DPDP.** Consent records at sign-up, privacy centre with rights requests (90-day due dates), data export, grievance contact.

## Connecting to vaakil.com's database (production plan)

The two live sites use **two separate Supabase projects**: www.vaakil.com (CMS) and search.vaakil.com (company directory). Recommended:

1. Confirm the www project is in **Mumbai (ap-south-1)**; if not, migrate before storing user documents.
2. Point `DATABASE_URL` at the www project (Supabase pooler, transaction mode) using a dedicated database role that is a member of `app_user`, and run `npm run db:migrate`. The AI app lives in its own schemas (`app`, `ai`, `esign`, …) next to the CMS tables in `public`; nothing in `public` is modified.
3. Keep the directory project separate and read it server-side with `DIRECTORY_SUPABASE_URL` / `DIRECTORY_SUPABASE_KEY` (read-only role). First remove the code on search.vaakil.com that inserts invented directors, revoke anonymous writes, and purge synthetic rows.
4. Move file storage to a private Supabase Storage bucket.
5. Host on Vercel with functions pinned to `bom1` (Mumbai).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run db:serve` | Local PostgreSQL (embedded binaries, data in `.data/postgres`) |
| `npm run db:generate` | Generate a migration from `src/lib/db/schema` |
| `npm run db:migrate` | Apply migrations + security layer |
| `npm run db:seed` | Seed plans, prompts, templates, statutes, local admin |
| `npm run judgments:import -- --court sc --year 2024 --limit 50` | Import judgments from the open Supreme/High Court datasets (CC-BY-4.0) |
| `npm run updates:sync` / `updates:check` | Check legal-update sources and India Code now (`check` = dry run) |
| `npm run db:check` | Verify the database security layer (RLS, triggers, privileges) |
| `npm run typecheck` / `npm test` / `npm run lint` | Checks |

See `docs/CONVENTIONS.md`, `docs/ADDING-A-FEATURE.md` and `docs/DESIGN-SYSTEM.md` (live reference at `/dev/ui`) before contributing. The research and build specification behind this app: `../reports/Vaakil legal AI platform research.md`.
