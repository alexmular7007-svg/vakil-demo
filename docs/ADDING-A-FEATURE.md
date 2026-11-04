# Adding a feature: the one pattern

Every feature follows the same five layers. The case diary is the reference
implementation; read it next to this page.

```
page (server)  →  action (input check)  →  query  →  database  →  screen (client)
src/app/app/diary/page.tsx
                   src/app/app/diary/actions.ts
                                           src/lib/diary/queries.ts
                                                      src/lib/db/schema/app.ts (+ security.sql)
                                                                   src/components/diary/*
```

## 1. Database (`src/lib/db/schema/*`)
- Add the table with an `ownerId` column (`ownerId()` helper) and indexes for the queries you will run.
- Text "enum" columns: add the allowed values to `src/lib/db/schema/enums.ts` and a `check("…_ck", oneOf(t.col, E.LIST))` to the table.
- Money is integer paise (`bigint({ mode: "number" })`) with a `>= 0` check.
- Register the table in `src/lib/db/sql/security.sql`: grant to `app_user`, add it to the `owner_all` RLS list, and add a same-owner trigger for every foreign key to another user-owned table.
- Generate and apply: `npm run db:generate -- --name <what>` then `npm run db:migrate`, then `npm run db:check` (must pass) and `npm test` (the isolation test covers new tables automatically through the doctor).

## 2. Query (`src/lib/<feature>/queries.ts`)
- `import "server-only"`. Read through `withUser(user.id, tx => …)` so row-level security applies.
- Return plain typed objects for the UI (no raw rows with internal columns).
- Pure logic (dates, money, parsing) goes in separate files with `*.test.ts` next to them.

## 3. Action (`src/app/app/<feature>/actions.ts`)
Use `defineAction` from `src/lib/define-action.ts`; it does identity, permission, zod validation, rate limit, `withUser`, audit and revalidation in the right order:

```ts
const createThingAction = defineAction({
  input: ThingInput,                         // zod schema (src/lib/<feature>/schemas.ts)
  permission: "advocate.inbox",              // optional, see src/lib/auth/permissions.ts
  rateLimit: { name: "thing", limit: 30, windowSeconds: 60 }, // optional
  run: async ({ user, tx, input }) => {      // runs inside withUser (RLS)
    const [r] = await tx.insert(things).values({ ...input, ownerId: user.id }).returning({ id: things.id });
    return { id: r.id };
  },
  audit: (input, r) => ({ action: "thing.created", entityType: "thing", entityId: r.id }),
  revalidate: () => ["/app/things"],
});

export async function createThing(input: ThingInputValues) {
  return createThingAction(input);
}
```
- Throw `ActionError("Not found.")` for a user-facing refusal and `ActionFieldError("field", "message")` for a field problem found after parsing.
- Never take a user id from input. Never catch and hide errors yourself: `defineAction` maps them to safe messages.

## 4. Page (`src/app/app/<feature>/page.tsx`)
- `const user = await requireUser("/app/<feature>")` at the top (the workspace `loading.tsx` provides the Suspense boundary).
- `<PageHeader eyebrow icon title description actions />`, then content. See docs/CONVENTIONS.md for the design system.

## 5. Screen (`src/components/<feature>/*`)
- Client components call the action and show `result.error` / `result.fieldErrors`.
- Mobile first (375px, no horizontal scroll, 44px targets), tokens only, `data-private` on client names.

## Checklist before you finish
`npx tsc --noEmit` · `npx eslint src` · `npm test` · `npm run db:check` · open the page at 375px and at desktop width.
