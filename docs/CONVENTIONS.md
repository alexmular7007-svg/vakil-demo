# Vaakil AI: code conventions

Read this before adding code. It is short on purpose.

## Stack
- Next.js **16.4** App Router with **Cache Components** on (`cacheComponents: true`). This is not the Next.js in most training data: read `node_modules/next/dist/docs/01-app/` (especially `01-getting-started/08-caching.md`, `02-guides/authentication-with-cache-components.md`, `02-guides/data-security.md`) before writing routes.
- React 19.3, TypeScript strict, Tailwind CSS 4 (tokens in `src/app/globals.css`), lucide-react icons, sonner toasts.
- Postgres via Drizzle (`casing: "snake_case"`). Local dev runs real PostgreSQL 18 from `npm run db:serve` (embedded binaries, data in `.data/postgres`, `DATABASE_URL` in `.env.local`); production uses Supabase Postgres.
- Auth: Better Auth (`src/lib/auth/server.ts`), two-factor and admin plugins.

## Cache Components rules (build errors if broken)
- Reading `cookies()`, `headers()`, the session, `searchParams`, `params` (without `generateStaticParams`), or doing an uncached DB query must happen **inside a `<Suspense>` boundary**. Every route under `/app` is already wrapped by `src/app/app/loading.tsx`, so a page there can `await requireUser()` at the top level. Layouts must **not** await runtime data at the top level: push it into a child component inside `<Suspense>`.
- Public marketing pages should be static: no session reads; DB reads go in `'use cache'` functions with `cacheLife(...)`, or inside `<Suspense>`.
- `Date.now()`, `Math.random()`, `crypto.randomUUID()` during render need `await connection()` first (inside Suspense) or a `'use cache'` scope.
- Client components that call `useSearchParams()` must sit inside `<Suspense>`.

## Security rules (non-negotiable)
1. **Identity only from the verified session.** Pages: `const user = await requireUser()`. Server actions and route handlers: `const user = await getCurrentUser(); if (!user) return fail("Please sign in.")`. Never accept a user id from the client.
2. **User data through `withUser(user.id, tx => ...)`** (`src/lib/db/index.ts`). It runs as the `app_user` role so Postgres row-level security (`src/lib/db/sql/security.sql`) limits rows to that user. Use the owner connection `db` only in server-only service code that performs its own authorization (admin pages after `requireAdmin()`, webhooks after signature checks, the e-sign signer portal after token + OTP checks).
3. **Every server action re-checks auth and validates input with Zod.** Server actions are public POST endpoints.
4. **Audit important writes** with `appendAudit({...})` from `src/lib/audit.ts` (hash-chained, append-only).
5. **Rate-limit** anything expensive or abusable with `enforceRateLimit(key, limit, windowSeconds)` from `src/lib/rate-limit.ts`.
6. **Secrets stay server-side**: anything reading `env` lives in `server-only` modules. Never put keys in client components or `NEXT_PUBLIC_*`.
7. **Files**: identify uploads by magic bytes (`sniffFile` in `src/lib/files/validate.ts`), enforce `maxUploadBytes()`, store with `putFile` (`src/lib/files/storage.ts`); never build paths from user input.
8. **No fake data, ever.** No placeholder testimonials, invented stats, simulated certificates, or silent canned fallbacks. When a feature needs a key that is not configured, show an honest "not configured" state (see `features` in `src/lib/env.ts`).

## AI
- Use `generateCompletion` / `streamCompletion` from `src/lib/ai/gateway.ts` (tiers `fast | standard | pro`; fair use, provider routing and cost tracking are built in). Catch `AiUnavailableError`, `FairUseLimitError`, `AiProviderError` and show their messages.
- Never present AI output as verified unless it was checked; legal content shows the disclaimer from `src/lib/site.ts`.

## Server actions
Build them with `defineAction` (`src/lib/define-action.ts`): it handles the session, permissions (`src/lib/auth/permissions.ts`), zod validation, rate limits, `withUser`, audit and revalidation. Throw `ActionError` / `ActionFieldError` from `src/lib/action.ts` for user-facing refusals. Step-by-step guide: `docs/ADDING-A-FEATURE.md` (reference: the case diary).

## Database integrity
- Allowed values for status/kind columns live in `src/lib/db/schema/enums.ts` and are enforced by CHECK constraints; import the lists instead of repeating strings.
- Rows can only reference rows of the same owner (same-owner triggers in `security.sql`).
- `npm run db:check` verifies RLS, server-only tables and triggers on any database; the admin overview shows the result.

## UI (design system v2: "court navy and brass")
Full reference: `docs/DESIGN-SYSTEM.md` and the live page `/dev/ui` (development only).
The product should feel like a premium banking app made for advocates: calm, precise, trustworthy.
- Primitives: `src/components/ui/button.tsx` (`Button`, `buttonVariants`, `asChild`; variants `primary | gold | secondary | outline | ghost | danger | link`; buttons are pills), `form.tsx` (`Input`, `Textarea`, `Select`, `Label`, `Field`, `Checkbox`), `display.tsx` (`Card*`, `Badge` with `tone` and optional `dot`, `Alert`, `Skeleton`, `Avatar`, `EmptyState`, `PageHeader` with optional `eyebrow` and `icon`, `IconTile`, `SectionHeader`, `Table/Th/Td`, `Separator`), `overlay.tsx` (`Dialog` = bottom sheet on phones, `Sheet` with `side="bottom"`, `Menu`/`MenuItem`, `Tabs`, `Switch`), `confirm.tsx` (`useConfirm()` instead of `window.confirm`), `ListRow` in `display.tsx`. Do not edit these shared files; build module components in your module folder.
- Colours only through tokens: `bg-bg`, `bg-surface`, `bg-surface-2`, `text-ink`, `text-ink-2`, `text-muted`, `border-border`, `border-border-input`, `bg-primary`, `text-primary`, `bg-primary-soft`, `text-primary-ink`, `bg-accent-soft`, `text-accent` (brass text), `success/warning/danger/info` (+ `-soft`). Brand surfaces: the `brand-surface` utility (navy gradient with a guilloché texture) with `text-on-brand`, `text-on-brand-muted`, `text-gold-bright`; use at most one brand surface per screen. Icon tiles: `<IconTile icon={X} tone="navy|gold|green|maroon|teal|slate|brand" size="sm|md|lg" />`. Dark mode works automatically through tokens. Never hard-code hex colours.
- Type: headings `font-serif` (Newsreader) at weight 600; UI text is Inter. Numbers, dates, amounts and case numbers get the `tabular` utility. Long legal text: `prose-legal`. Hindi text: add `lang="hi"`, no uppercase or letter-spacing on Hindi.
- Shapes: cards `rounded-lg` (18px) with `shadow-sm`; inner list rows inside one card separated by `divide-y divide-border`; tiles 14px; pills for buttons and chips. Status chips: `<Badge tone="info" dot>Listed today</Badge>` (info = listed/scheduled, warning = adjourned/due, success = done/paid/signed, danger = overdue, neutral = draft, accent = AI draft).
- Lists look like bank transaction lists: a leading `IconTile size="sm"`, a bold title, a muted second line with tabular numbers, and a chip or chevron on the right; rows at least 56px tall and fully tappable.
- Glass: the `glass` utility (frosted panel) is for floating or overlapping UI only: pop-ups, sticky bars, sheets, chips over imagery. `glass-on-brand` is for panels on navy brand surfaces. Never put long reading text on glass. The workspace background uses `ambient-bg` so glass has depth.
- Icons: lucide-react only (stroke width is set globally). No emoji anywhere in the UI.
- Responsive: design mobile first (375px), then `sm` (640), `md` (768, tablet), `lg` (1024, desktop). No horizontal scrolling. Touch targets at least 44px on phones. The app shell provides the navy sidebar (desktop), rail (tablet), top app bar and bottom tab bar (phone); pages just render content.
- Privacy: wrap client names and other personal details shown on overview screens in an element with `data-private` so privacy mode can blur them.
- Accessibility: every input has a label, icon-only buttons have `aria-label`, use semantic headings in order.
- Page structure under `/app`: `<PageHeader eyebrow title description actions icon />` then content.

## Do not
- Do not edit `src/lib/db/schema/*`, migrations, `security.sql`, shared UI primitives, `next.config.ts`, or `package.json`. If you need a schema change or a package, say so in your report.
- Statute text changes only through `reviseSection` / `removeSection` / `reviseSections` (batch) in `src/lib/corpus/revise.ts`: they take a per-act advisory lock and record every change in the append-only `corpus.section_revisions`. Diffs and safety limits live in `src/lib/corpus/plan.ts` (shared by the India Code sync and the admin paste flow).
- Do not run `npm run db:*`, `next dev`, `next build` or install packages (the embedded database must not be opened by two processes). Verify with `npx tsc --noEmit` and `npx eslint <your files>`.
