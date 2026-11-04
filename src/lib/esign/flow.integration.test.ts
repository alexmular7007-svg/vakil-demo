// End-to-end e-sign flow against an isolated in-memory PGlite (never the shared
// .data/pglite): migrations + security.sql, then create -> send -> OTP -> review
// -> parallel signatures -> witness -> completion, plus decline, void, expiry and
// tamper checks against the real triggers.

import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Isolate env BEFORE any app module loads (they are imported dynamically below).
const scratch = mkdtempSync(path.join(process.env.ESIGN_TEST_TMP ?? tmpdir(), "vaakil-esign-"));
process.env.FILE_STORAGE_DIR = path.join(scratch, "uploads");
process.env.PGLITE_DIR = path.join(scratch, "pglite-unused");
process.env.APP_URL = "http://localhost:3000";
delete process.env.RESEND_API_KEY;
delete process.env.DATABASE_URL;

const jar = new Map<string, string>();
const cookieOpts = new Map<string, Record<string, unknown>>();
// One cookie jar per simulated browser, so two signers can act in parallel.
const browser = new AsyncLocalStorage<Map<string, string>>();
const currentJar = () => browser.getStore() ?? jar;
const h = vi.hoisted(() => ({
  failEmailTo: new Set<string>(),
  user: null as null | Record<string, unknown>,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (currentJar().has(name) ? { name, value: currentJar().get(name)! } : undefined),
    set: (name: string, value: string, opts?: { maxAge?: number }) => {
      cookieOpts.set(name, { ...(opts ?? {}) });
      if (opts?.maxAge === 0) currentJar().delete(name);
      else currentJar().set(name, value);
    },
  }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.7" }),
}));
// Email failures on demand; everything else goes to the real dev outbox.
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...real,
    sendEmail: async (e: { to: string; subject: string; text: string }) => {
      if (h.failEmailTo.has(e.to)) throw new Error("smtp down");
      return real.sendEmail(e);
    },
  };
});
// Owner server actions read the session through the DAL.
vi.mock("@/lib/auth/dal", () => ({
  getCurrentUser: async () => h.user,
  requestIp: async () => "203.0.113.7",
  requireUser: async () => h.user,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { sql } = await import("drizzle-orm");
  const schema = await import("@/lib/db/schema");
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: "snake_case" });
  async function withUser<T>(userId: string, fn: (tx: unknown) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_user`);
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      return fn(tx);
    });
  }
  return { db, withUser, schema };
});

type Mods = {
  dbm: typeof import("@/lib/db");
  schema: typeof import("@/lib/db/schema");
  service: typeof import("./service");
  signer: typeof import("./signer");
  events: typeof import("./events");
  queries: typeof import("./queries");
  pdf: typeof import("./pdf");
  orm: typeof import("drizzle-orm");
  errors: typeof import("./errors");
};
let m: Mods;

const OWNER = {
  id: "owner-1",
  name: "Adv. Asha Verma",
  email: "owner@example.com",
  emailVerified: true,
  role: "advocate" as const,
  locale: "en",
  persona: "advocate",
  twoFactorEnabled: false,
  image: null,
};
const META = { ip: "203.0.113.7", userAgent: "vitest" };
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let pdfBytes: Uint8Array;

beforeAll(async () => {
  m = {
    dbm: await import("@/lib/db"),
    schema: await import("@/lib/db/schema"),
    service: await import("./service"),
    signer: await import("./signer"),
    events: await import("./events"),
    queries: await import("./queries"),
    pdf: await import("./pdf"),
    orm: await import("drizzle-orm"),
    errors: await import("./errors"),
  };
  const client = (m.dbm.db as unknown as { $client: { exec: (s: string) => Promise<unknown> } }).$client;
  const root = path.resolve(__dirname, "../../..");
  // Every migration in order, as `npm run db:migrate` applies them.
  for (const f of readdirSync(path.join(root, "drizzle")).filter((n) => n.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(path.join(root, "drizzle", f), "utf8"));
  }
  await client.exec(readFileSync(path.join(root, "src/lib/db/sql/security.sql"), "utf8"));
  await m.dbm.db.insert(m.schema.user).values({ id: OWNER.id, name: OWNER.name, email: OWNER.email, emailVerified: true });
  pdfBytes = await m.pdf.renderTextPdf({ title: "Service Agreement", body: "1. Scope.\n\n2. Fees: Rs. 50,000.\n\n3. Term: one year." });
}, 60_000);

beforeEach(() => jar.clear());

afterAll(async () => {
  const client = (m?.dbm.db as unknown as { $client?: { close: () => Promise<void> } })?.$client;
  await client?.close();
  rmSync(scratch, { recursive: true, force: true });
});

async function outbox() {
  return m.dbm.db.select().from(m.schema.outbox).orderBy(m.orm.asc(m.schema.outbox.createdAt));
}
async function latestLink(to: string): Promise<string> {
  const mails = (await outbox()).filter((e) => e.to === to);
  for (let i = mails.length - 1; i >= 0; i--) {
    const t = /\/s\/([A-Za-z0-9_-]{43})/.exec(mails[i].text);
    if (t) return t[1];
  }
  throw new Error(`no link for ${to}`);
}
async function latestCode(to: string): Promise<string> {
  const mails = (await outbox()).filter((e) => e.to === to && e.subject.includes("signing code"));
  const code = /(\d{6})$/.exec(mails[mails.length - 1].subject);
  if (!code) throw new Error("no code");
  return code[1];
}
async function verify(token: string, email: string) {
  jar.clear();
  await m.signer.requestOtp(token, META);
  await m.signer.verifyOtp(token, await latestCode(email), META);
}

const baseInput = {
  title: "Service Agreement",
  message: "Please review.",
  docCategory: "service_agreement",
  expiryDays: 7,
  signatureType: "electronic" as const,
  draftId: null,
};

describe("multi-party e-sign flow", () => {
  it("runs review -> parallel signing -> witness -> completion with an intact chain", async () => {
    const { id } = await m.service.createEnvelope(
      OWNER,
      {
        ...baseInput,
        recipients: [
          { name: "Adv. Lawyer", email: "lawyer@example.com", roleLabel: "LAWYER", action: "REVIEW", routingOrder: 1 },
          { name: "Sender Co", email: "sender@example.com", roleLabel: "SENDER", action: "SIGN", routingOrder: 2 },
          { name: "Receiver Ltd", email: "receiver@example.com", roleLabel: "RECEIVER", action: "SIGN", routingOrder: 2 },
          { name: "Adv. Lawyer", email: "lawyer@example.com", roleLabel: "LAWYER", action: "WITNESS", routingOrder: 3 },
          { name: "Copy Person", email: "cc@example.com", roleLabel: "OTHER", action: "CC", routingOrder: 1 },
        ],
      },
      { kind: "upload", bytes: pdfBytes, filename: "agreement.pdf" },
      META,
    );

    // Draft: owner reads via RLS, no chain events yet.
    const draft = await m.queries.getEnvelopeDetail(OWNER.id, id);
    expect(draft?.envelope.status).toBe("DRAFT");
    expect(draft?.events).toHaveLength(0);
    expect(await m.queries.getEnvelopeDetail("someone-else", id)).toBeNull();

    const sent = await m.service.sendEnvelope(OWNER, id, META);
    expect(sent.notified).toBe(1);

    // Step 1: lawyer review.
    const reviewToken = await latestLink("lawyer@example.com");
    let view = await m.signer.getSignerView(reviewToken);
    expect(view?.canAct).toBe(true);
    expect(view?.verified).toBe(false);
    await expect(m.signer.approveAsReviewer(reviewToken, META)).rejects.toThrow(/timed out|code/i);
    await m.signer.requestOtp(reviewToken, META);
    await expect(m.signer.verifyOtp(reviewToken, "000000" === (await latestCode("lawyer@example.com")) ? "111111" : "000000", META)).rejects.toThrow(
      /not right/,
    );
    await m.signer.verifyOtp(reviewToken, await latestCode("lawyer@example.com"), META);
    view = await m.signer.getSignerView(reviewToken);
    expect(view?.verified).toBe(true);
    const doc = await m.signer.openLockedDocument(reviewToken, META);
    expect(doc.bytes.byteLength).toBe(pdfBytes.byteLength);
    await m.signer.approveAsReviewer(reviewToken, META);

    // Step 2: both parties in parallel; witness waits.
    const senderToken = await latestLink("sender@example.com");
    const receiverToken = await latestLink("receiver@example.com");
    await verify(senderToken, "sender@example.com");
    await m.signer.signDocument(senderToken, { kind: "typed", text: "Sender Co" }, META);
    let detail = await m.queries.getEnvelopeDetail(OWNER.id, id);
    expect(detail?.envelope.status).toBe("PARTIALLY_SIGNED");
    expect(detail?.recipients.find((r) => r.action === "WITNESS")?.status).toBe("PENDING");

    await verify(receiverToken, "receiver@example.com");
    await m.signer.signDocument(receiverToken, { kind: "drawn", image: PNG }, META);

    // Step 3: the witness row gets its own link; the review link only shows "approved".
    const witnessToken = await latestLink("lawyer@example.com");
    expect(witnessToken).not.toBe(reviewToken);
    const reviewView = await m.signer.getSignerView(reviewToken);
    expect(reviewView?.me.status).toBe("APPROVED");
    expect(reviewView?.canAct).toBe(false);
    await verify(witnessToken, "lawyer@example.com");
    const res = await m.signer.signDocument(witnessToken, { kind: "typed", text: "Adv. Lawyer" }, META);
    expect(res.completed).toBe(true);

    detail = await m.queries.getEnvelopeDetail(OWNER.id, id);
    const env = detail!.envelope;
    expect(env.status).toBe("COMPLETED");
    expect(env.lockedSha256).toBe(env.originalSha256);
    expect(env.finalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(detail!.recipients.every((r) => r.action === "CC" || r.signedSha256 === env.lockedSha256)).toBe(true);

    // Every party (CC included) and the owner got the completion email.
    const completedMails = (await outbox()).filter((e) => e.subject.startsWith("Completed:"));
    expect(new Set(completedMails.map((e) => e.to))).toEqual(
      new Set(["lawyer@example.com", "sender@example.com", "receiver@example.com", "cc@example.com", "owner@example.com"]),
    );
    const ccToken = await latestLink("cc@example.com");
    // The final copy needs the email one-time code too (a forwarded link alone is not enough).
    jar.clear();
    await expect(m.signer.openFinalDocument(ccToken, META)).rejects.toThrow(/one-time code/);
    await verify(ccToken, "cc@example.com");
    const final = await m.signer.openFinalDocument(ccToken, META);
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(final.bytes)).getPageCount()).toBeGreaterThan((await PDFDocument.load(pdfBytes)).getPageCount());
    const { sha256 } = await import("@/lib/crypto");
    expect(sha256(final.bytes)).toBe(env.finalSha256);

    // Chain verifies, including the document cross-checks.
    const report = await m.events.verifyEnvelopeChain(id);
    expect(report.ok).toBe(true);
    expect(report.documentChecks.every((c) => c.ok)).toBe(true);
    expect(report.checked).toBeGreaterThan(15);

    // Public verification exposes no names or emails.
    const pub = await m.queries.getPublicVerification(id);
    expect(JSON.stringify(pub)).not.toMatch(/example\.com|Sender Co|Adv\. Lawyer/);
    expect(pub?.envelope.finalSha256).toBe(env.finalSha256);

    // Database triggers: append-only events, frozen hashes, no delete after send.
    const { sql } = m.orm;
    await expect(m.dbm.db.execute(sql`update esign.events set ip = '1.1.1.1' where envelope_id = ${id}`)).rejects.toThrow();
    await expect(m.dbm.db.execute(sql`delete from esign.events where envelope_id = ${id}`)).rejects.toThrow();
    await expect(m.dbm.db.execute(sql`update esign.envelopes set final_sha256 = 'x' where id = ${id}`)).rejects.toThrow();
    await expect(m.dbm.db.execute(sql`update esign.envelopes set status = 'VOIDED' where id = ${id}`)).rejects.toThrow();
    await expect(m.dbm.db.execute(sql`delete from esign.envelopes where id = ${id}`)).rejects.toThrow();
  }, 60_000);

  it("a decline closes the envelope and tells the owner", async () => {
    const { id } = await m.service.createEnvelope(
      OWNER,
      {
        ...baseInput,
        recipients: [
          { name: "Reviewer", email: "rev2@example.com", roleLabel: "LAWYER", action: "REVIEW", routingOrder: 1 },
          { name: "Signer", email: "sig2@example.com", roleLabel: "SENDER", action: "SIGN", routingOrder: 2 },
        ],
      },
      { kind: "upload", bytes: pdfBytes, filename: "a.pdf" },
      META,
    );
    await m.service.sendEnvelope(OWNER, id, META);
    const token = await latestLink("rev2@example.com");
    await verify(token, "rev2@example.com");
    await m.signer.declineEnvelope(token, "Clause 4 is wrong", META);
    const detail = await m.queries.getEnvelopeDetail(OWNER.id, id);
    expect(detail?.envelope.status).toBe("DECLINED");
    expect((await outbox()).some((e) => e.to === OWNER.email && e.subject === "Declined: Service Agreement")).toBe(true);
    expect((await outbox()).some((e) => e.to === "sig2@example.com")).toBe(false);
    await expect(m.signer.approveAsReviewer(token, META)).rejects.toThrow();
    expect((await m.events.verifyEnvelopeChain(id)).ok).toBe(true);
  }, 30_000);

  it("void, draft delete, expiry and excluded categories", async () => {
    const two = [
      { name: "Signer A", email: "a3@example.com", roleLabel: "SENDER" as const, action: "SIGN" as const, routingOrder: 1 },
      { name: "Signer B", email: "b3@example.com", roleLabel: "RECEIVER" as const, action: "SIGN" as const, routingOrder: 1 },
    ];
    // Excluded category is refused.
    await expect(
      m.service.createEnvelope(OWNER, { ...baseInput, docCategory: "will", recipients: two }, { kind: "upload", bytes: pdfBytes, filename: "w.pdf" }, META),
    ).rejects.toBeInstanceOf(m.errors.EsignError);
    // Non-PDF is refused.
    await expect(
      m.service.createEnvelope(OWNER, { ...baseInput, recipients: two }, { kind: "upload", bytes: new TextEncoder().encode("hello"), filename: "x.pdf" }, META),
    ).rejects.toThrow(/PDF/);

    // Draft delete.
    const d = await m.service.createEnvelope(OWNER, { ...baseInput, recipients: two }, { kind: "upload", bytes: pdfBytes, filename: "d.pdf" }, META);
    await m.service.deleteDraftEnvelope(OWNER, d.id, META);
    expect(await m.queries.getEnvelopeDetail(OWNER.id, d.id)).toBeNull();

    // Void.
    const v = await m.service.createEnvelope(OWNER, { ...baseInput, recipients: two }, { kind: "upload", bytes: pdfBytes, filename: "v.pdf" }, META);
    await m.service.sendEnvelope(OWNER, v.id, META);
    expect((await m.service.sendEnvelope(OWNER, v.id, META).catch((e: Error) => e.message)) as string).toMatch(/already been sent/);
    const vt = await latestLink("a3@example.com");
    await m.service.voidEnvelope(OWNER, v.id, "Wrong version", META);
    expect((await m.signer.getSignerView(vt))?.envelope.status).toBe("VOIDED");
    await expect(m.signer.requestOtp(vt, META)).rejects.toThrow();
    await expect(m.service.deleteDraftEnvelope(OWNER, v.id, META)).rejects.toThrow(/Only drafts/);

    // Expiry on access.
    const e = await m.service.createEnvelope(OWNER, { ...baseInput, recipients: two }, { kind: "upload", bytes: pdfBytes, filename: "e.pdf" }, META);
    await m.service.sendEnvelope(OWNER, e.id, META);
    const et = await latestLink("a3@example.com");
    await m.dbm.db.execute(m.orm.sql`update esign.envelopes set expires_at = now() - interval '1 minute' where id = ${e.id}`);
    expect((await m.signer.getSignerView(et))?.envelope.status).toBe("EXPIRED");
    const trail = (await m.queries.getEnvelopeDetail(OWNER.id, e.id))!.events.map((x) => x.type);
    expect(trail).toContain("envelope.expired");
    expect((await m.events.verifyEnvelopeChain(e.id)).ok).toBe(true);

    // Another user cannot act on, or even see, the owner's envelope.
    await expect(m.service.voidEnvelope({ ...OWNER, id: "intruder" }, e.id, "nope", META)).rejects.toThrow(/not found/);
    expect(await m.queries.ownsEnvelope("intruder", e.id)).toBeNull();
    expect((await m.queries.ownsEnvelope(OWNER.id, e.id))?.id).toBe(e.id);
    const mine = await m.queries.listEnvelopes(OWNER.id, "closed");
    expect(mine.rows.map((r) => r.id)).toEqual(expect.arrayContaining([v.id, e.id]));
    expect((await m.queries.listEnvelopes("intruder", "all")).rows).toHaveLength(0);
  }, 60_000);

  it("builds the PDF from an English draft and refuses Hindi drafts", async () => {
    const { drafts } = m.schema;
    const [en] = await m.dbm.db
      .insert(drafts)
      .values({ ownerId: OWNER.id, title: "Legal Notice", body: "# Notice\n\nYou are hereby called upon to pay **Rs. 1,00,000** within 15 days." })
      .returning({ id: drafts.id });
    const [hi] = await m.dbm.db
      .insert(drafts)
      .values({ ownerId: OWNER.id, title: "कानूनी नोटिस", body: "आपको सूचित किया जाता है", language: "hi" })
      .returning({ id: drafts.id });
    const two = [{ name: "Signer", email: "s6@example.com", roleLabel: "SENDER" as const, action: "SIGN" as const, routingOrder: 1 }];
    const { id } = await m.service.createEnvelope(OWNER, { ...baseInput, draftId: en.id, recipients: two }, { kind: "draft", draftId: en.id }, META);
    const detail = await m.queries.getEnvelopeDetail(OWNER.id, id);
    expect(detail?.envelope.originalName).toBe("Legal Notice.pdf");
    await expect(
      m.service.createEnvelope(OWNER, { ...baseInput, draftId: hi.id, recipients: two }, { kind: "draft", draftId: hi.id }, META),
    ).rejects.toBeInstanceOf(m.pdf.UnsupportedTextError);
    // Another user's draft is invisible through RLS.
    await expect(
      m.service.createEnvelope({ ...OWNER, id: "intruder" }, { ...baseInput, draftId: en.id, recipients: two }, { kind: "draft", draftId: en.id }, META),
    ).rejects.toThrow(/not found/);
  }, 30_000);

  it("links a verified advocate and uses their registered email", async () => {
    const { advocateProfiles, user } = m.schema;
    await m.dbm.db.insert(user).values([
      { id: "adv-1", name: "Adv. Listed", email: "listed.adv@example.com", emailVerified: true },
      { id: "adv-2", name: "Adv. Pending", email: "pending.adv@example.com", emailVerified: true },
    ]);
    await m.dbm.db.insert(advocateProfiles).values([
      { userId: "adv-1", displayName: "Adv. Listed", enrolmentNo: "D/123/2010", stateBarCouncil: "Delhi", verificationStatus: "verified", isListed: true },
      { userId: "adv-2", displayName: "Adv. Pending", enrolmentNo: "D/999/2020", stateBarCouncil: "Delhi", verificationStatus: "pending", isListed: true },
    ]);
    const recipients = (advocateUserId: string) => [
      { name: "Adv. X", email: "", roleLabel: "LAWYER" as const, action: "REVIEW" as const, routingOrder: 1, advocateUserId },
      { name: "Signer", email: "s5@example.com", roleLabel: "SENDER" as const, action: "SIGN" as const, routingOrder: 2 },
    ];
    const { id } = await m.service.createEnvelope(OWNER, { ...baseInput, recipients: recipients("adv-1") }, { kind: "upload", bytes: pdfBytes, filename: "l.pdf" }, META);
    const detail = await m.queries.getEnvelopeDetail(OWNER.id, id);
    const lawyer = detail!.recipients.find((r) => r.roleLabel === "LAWYER")!;
    expect(lawyer.advocateUserId).toBe("adv-1");
    expect(lawyer.email).toBe("listed.adv@example.com");
    await expect(
      m.service.createEnvelope(OWNER, { ...baseInput, recipients: recipients("adv-2") }, { kind: "upload", bytes: pdfBytes, filename: "p.pdf" }, META),
    ).rejects.toThrow(/verified/);
  }, 30_000);
});

/* ------------------------------------------------------------------ */
/* Concurrency, idempotency, expiry, signer security, integrity        */
/* ------------------------------------------------------------------ */

const OWNER2 = { ...OWNER, id: "owner-2", name: "Adv. Ravi Menon", email: "owner2@example.com" };
let ipSeq = 10;
/** A fresh client IP per signer, so per-IP limits from one test do not leak into the next. */
const metaFor = () => ({ ip: `198.51.100.${ipSeq++}`, userAgent: "vitest" });

async function mailsTo(to: string, subjectPart: string) {
  return (await outbox()).filter((e) => e.to === to && e.subject.includes(subjectPart));
}
async function eventTypes(id: string) {
  const rows = await m.dbm.db.select().from(m.schema.events).where(m.orm.eq(m.schema.events.envelopeId, id));
  return rows.map((r) => r.type);
}
async function envelopeRow(id: string) {
  const [row] = await m.dbm.db.select().from(m.schema.envelopes).where(m.orm.eq(m.schema.envelopes.id, id));
  return row;
}
/** Verify OTP inside a simulated browser (its own cookie jar). */
async function verifyIn(store: Map<string, string>, token: string, email: string, meta = metaFor()) {
  await browser.run(store, async () => {
    await m.signer.requestOtp(token, meta);
    await m.signer.verifyOtp(token, await latestCode(email), meta);
  });
}
async function newEnvelope(title: string, people: { name: string; email: string; roleLabel: string; action: string; routingOrder: number }[], owner = OWNER2) {
  return m.service.createEnvelope(
    owner,
    { ...baseInput, title, recipients: people as never },
    { kind: "upload", bytes: pdfBytes, filename: `${title}.pdf` },
    META,
  );
}
const storagePath = (key: string) => path.join(process.env.FILE_STORAGE_DIR!, key);

describe("e-sign hardening", () => {
  beforeAll(async () => {
    await m.dbm.db.insert(m.schema.user).values({ id: OWNER2.id, name: OWNER2.name, email: OWNER2.email, emailVerified: true });
  });
  beforeEach(() => {
    h.failEmailTo.clear();
    h.user = null;
  });

  it("parallel signers: one completion, no duplicate records, repeats are harmless", async () => {
    const title = "Parallel Agreement";
    const { id } = await newEnvelope(title, [
      { name: "Reviewer P", email: "rev-p@example.com", roleLabel: "LAWYER", action: "REVIEW", routingOrder: 1 },
      { name: "Party One", email: "one-p@example.com", roleLabel: "SENDER", action: "SIGN", routingOrder: 2 },
      { name: "Party Two", email: "two-p@example.com", roleLabel: "RECEIVER", action: "SIGN", routingOrder: 2 },
      { name: "Copy P", email: "cc-p@example.com", roleLabel: "OTHER", action: "CC", routingOrder: 1 },
    ]);
    await m.service.sendEnvelope(OWNER2, id, META);
    // Routing: only step 1 has a link.
    expect(await mailsTo("one-p@example.com", title)).toHaveLength(0);

    const rev = new Map<string, string>();
    const revToken = await latestLink("rev-p@example.com");
    await verifyIn(rev, revToken, "rev-p@example.com");
    // Double click on "Approve": both calls succeed, one approval is recorded.
    const meta = metaFor();
    const [a1, a2] = await browser.run(rev, () =>
      Promise.all([m.signer.approveAsReviewer(revToken, meta), m.signer.approveAsReviewer(revToken, meta)]),
    );
    expect([a1.completed, a2.completed]).toEqual([false, false]);
    let types = await eventTypes(id);
    expect(types.filter((t) => t === "recipient.approved")).toHaveLength(1);
    expect(types.filter((t) => t === "order.completed")).toHaveLength(1);
    expect(await mailsTo("one-p@example.com", "Please sign")).toHaveLength(1);
    expect(await mailsTo("two-p@example.com", "Please sign")).toHaveLength(1);

    // Both parties sign at the same moment, each in their own browser.
    const one = new Map<string, string>();
    const two = new Map<string, string>();
    const oneToken = await latestLink("one-p@example.com");
    const twoToken = await latestLink("two-p@example.com");
    await verifyIn(one, oneToken, "one-p@example.com");
    await verifyIn(two, twoToken, "two-p@example.com");
    const [m1, m2] = [metaFor(), metaFor()];
    const results = await Promise.all([
      browser.run(one, () => m.signer.signDocument(oneToken, { kind: "typed", text: "Party One" }, m1)),
      browser.run(two, () => m.signer.signDocument(twoToken, { kind: "typed", text: "Party Two" }, m2)),
    ]);
    expect(results.filter((r) => r.completed)).toHaveLength(1);

    const env = await envelopeRow(id);
    expect(env.status).toBe("COMPLETED");
    types = await eventTypes(id);
    expect(types.filter((t) => t === "envelope.completed")).toHaveLength(1);
    expect(types.filter((t) => t === "recipient.signed")).toHaveLength(2);
    for (const to of ["rev-p@example.com", "one-p@example.com", "two-p@example.com", "cc-p@example.com", OWNER2.email]) {
      expect(await mailsTo(to, `Completed: ${title}`)).toHaveLength(1);
    }

    // A retry of the final signature after completion (its link was replaced by the
    // download link) reports the same outcome instead of "invalid link".
    const lastToken = results[0].completed ? oneToken : twoToken;
    const lastJar = results[0].completed ? one : two;
    await expect(browser.run(lastJar, () => m.signer.signDocument(lastToken, { kind: "typed", text: "again" }, metaFor()))).resolves.toEqual({
      completed: true,
    });
    // ...but a different action, or no verified session, is still refused.
    await expect(browser.run(lastJar, () => m.signer.declineEnvelope(lastToken, "changed my mind", metaFor()))).rejects.toThrow(/not valid/);
    await expect(browser.run(new Map(), () => m.signer.signDocument(lastToken, { kind: "typed", text: "x" }, metaFor()))).rejects.toThrow(/not valid/);
    expect((await eventTypes(id)).filter((t) => t === "recipient.signed")).toHaveLength(2);

    // The signed PDF's hash is exactly what the verify page publishes.
    const ccToken = await latestLink("cc-p@example.com");
    const cc = new Map<string, string>();
    await verifyIn(cc, ccToken, "cc-p@example.com");
    const final = await browser.run(cc, () => m.signer.openFinalDocument(ccToken, metaFor()));
    const { sha256 } = await import("@/lib/crypto");
    const pub = await m.queries.getPublicVerification(id);
    expect(sha256(final.bytes)).toBe(pub?.envelope.finalSha256);
    expect(await m.queries.getPublicIntegrity(id)).toEqual({ chain: { ok: true, checked: expect.any(Number) }, storedFinal: "ok" });
    expect((await m.events.verifyEnvelopeChain(id)).ok).toBe(true);

    // Tampered or missing stored copy: reported, never served.
    const finalPath = storagePath(env.finalStorageKey!);
    const good = readFileSync(finalPath);
    writeFileSync(finalPath, Buffer.concat([good, Buffer.from("%tampered")]));
    expect((await m.queries.getPublicIntegrity(id))?.storedFinal).toBe("mismatch");
    await expect(browser.run(cc, () => m.signer.openFinalDocument(ccToken, metaFor()))).rejects.toMatchObject({ status: 409 });
    unlinkSync(finalPath);
    expect((await m.queries.getPublicIntegrity(id))?.storedFinal).toBe("missing");
    await expect(browser.run(cc, () => m.signer.openFinalDocument(ccToken, metaFor()))).rejects.toMatchObject({ status: 410 });
    writeFileSync(finalPath, good);
    expect((await m.queries.getPublicIntegrity(id))?.storedFinal).toBe("ok");
  }, 60_000);

  it("a later step cannot act early, even with a link", async () => {
    const { id } = await newEnvelope("Order Agreement", [
      { name: "Reviewer O", email: "rev-o@example.com", roleLabel: "LAWYER", action: "REVIEW", routingOrder: 1 },
      { name: "Signer O", email: "sig-o@example.com", roleLabel: "SENDER", action: "SIGN", routingOrder: 2 },
    ]);
    await m.service.sendEnvelope(OWNER2, id, META);
    // Give the step-2 signer a working link before their turn (as if one leaked or was issued in error).
    const { randomToken, sha256 } = await import("@/lib/crypto");
    const early = randomToken();
    await m.dbm.db
      .update(m.schema.recipients)
      .set({ accessTokenHash: sha256(early) })
      .where(m.orm.and(m.orm.eq(m.schema.recipients.envelopeId, id), m.orm.eq(m.schema.recipients.email, "sig-o@example.com")));
    const view = await m.signer.getSignerView(early);
    expect(view?.canAct).toBe(false);
    expect(view?.waitingForEarlier).toBe(true);
    await expect(m.signer.requestOtp(early, metaFor())).rejects.toThrow(/nothing for you to do/);
    await expect(m.signer.signDocument(early, { kind: "typed", text: "Signer O" }, metaFor())).rejects.toThrow(/timed out|nothing|no longer open/);
    // Reminders go to the current step only.
    const res = await m.service.remindRecipients(OWNER2, id, META);
    expect(res.reminded).toBe(1);
    expect(await mailsTo("sig-o@example.com", "Reminder")).toHaveLength(0);
  }, 30_000);

  it("signer security: hashed OTPs, limits, cookie flags, nothing shown before OTP", async () => {
    const title = "Confidential Settlement";
    const { id } = await newEnvelope(title, [
      { name: "Signer S", email: "sig-s@example.com", roleLabel: "SENDER", action: "SIGN", routingOrder: 1 },
      { name: "Signer T", email: "sig-t@example.com", roleLabel: "RECEIVER", action: "SIGN", routingOrder: 1 },
    ]);
    await m.service.sendEnvelope(OWNER2, id, META);
    const token = await latestLink("sig-s@example.com");
    const env = await envelopeRow(id);

    // Link tokens are stored only as SHA-256.
    const rs = await m.dbm.db.select().from(m.schema.recipients).where(m.orm.eq(m.schema.recipients.envelopeId, id));
    const { sha256 } = await import("@/lib/crypto");
    const me = rs.find((r) => r.email === "sig-s@example.com")!;
    expect(me.accessTokenHash).toBe(sha256(token));
    expect(JSON.stringify(rs)).not.toContain(token);

    // Before the OTP: no title, message, file name, fingerprints or progress.
    const store = new Map<string, string>();
    const before = await browser.run(store, () => m.signer.getSignerView(token));
    expect(before?.details).toBeNull();
    expect(before?.canVerify).toBe(true);
    const leaked = JSON.stringify(before);
    for (const secret of [title, "Please review.", `${title}.pdf`, env.lockedSha256!, id]) expect(leaked).not.toContain(secret);
    await expect(browser.run(store, () => m.signer.openLockedDocument(token, metaFor()))).rejects.toMatchObject({ status: 401 });

    // A double click on "Email me a code" sends one code.
    const meta = metaFor();
    await browser.run(store, () => m.signer.requestOtp(token, meta));
    await browser.run(store, () => m.signer.requestOtp(token, meta));
    expect(await mailsTo("sig-s@example.com", "signing code")).toHaveLength(1);
    const code = await latestCode("sig-s@example.com");
    const [otp] = await m.dbm.db.select().from(m.schema.otpCodes).where(m.orm.eq(m.schema.otpCodes.recipientId, me.id));
    expect(otp.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(otp.codeHash).not.toContain(code);
    expect(otp.codeHash).not.toBe(sha256(code));
    expect(otp.codeHash).not.toBe(sha256(`esign-otp:${me.id}:${code}`));
    expect(otp.expiresAt.getTime() - otp.createdAt.getTime()).toBeLessThanOrEqual(10 * 60_000 + 1000);

    // Correct code: short-lived, httpOnly, SameSite=Strict cookie scoped to the link.
    await browser.run(store, () => m.signer.verifyOtp(token, code, meta));
    expect(cookieOpts.get("vk_signer")).toMatchObject({ httpOnly: true, sameSite: "strict", path: `/s/${token}`, maxAge: 30 * 60 });
    const after = await browser.run(store, () => m.signer.getSignerView(token));
    expect(after?.details?.title).toBe(title);
    expect(after?.details?.lockedSha256).toBe(env.lockedSha256);
    // Submitting the same code again (double submit) succeeds but grants no new session elsewhere.
    const elsewhere = new Map<string, string>();
    await expect(browser.run(elsewhere, () => m.signer.verifyOtp(token, code, meta))).resolves.toBeUndefined();
    expect(elsewhere.size).toBe(0);
    expect((await browser.run(elsewhere, () => m.signer.getSignerView(token)))?.details).toBeNull();

    // Attempts per code, then the per-recipient rate limit.
    const t2 = await latestLink("sig-t@example.com");
    const tStore = new Map<string, string>();
    const tMeta = metaFor();
    await browser.run(tStore, () => m.signer.requestOtp(t2, tMeta));
    const right = await latestCode("sig-t@example.com");
    const wrong = right === "000000" ? "111111" : "000000";
    const messages: string[] = [];
    for (let i = 0; i < 11; i++) {
      messages.push(await browser.run(tStore, () => m.signer.verifyOtp(t2, i === 5 ? right : wrong, tMeta)).then(() => "ok", (e: Error) => e.message));
    }
    expect(messages[0]).toMatch(/4 attempts left/);
    expect(messages[4]).toMatch(/Too many incorrect attempts/);
    expect(messages[5]).toMatch(/Too many incorrect attempts/); // the right code no longer works on a locked code
    expect(messages[10]).toMatch(/Too many requests/);
    expect(tStore.size).toBe(0);

    // Decline twice (double click): one decline, one notice to the owner.
    const dMeta = metaFor();
    await browser.run(store, () => m.signer.declineEnvelope(token, "Wrong amount", dMeta));
    await expect(browser.run(store, () => m.signer.declineEnvelope(token, "Wrong amount", dMeta))).resolves.toEqual({ completed: false });
    expect((await eventTypes(id)).filter((t) => t === "recipient.declined")).toHaveLength(1);
    expect(await mailsTo(OWNER2.email, `Declined: ${title}`)).toHaveLength(1);
    await expect(browser.run(store, () => m.signer.signDocument(token, { kind: "typed", text: "Signer S" }, dMeta))).rejects.toThrow(/declined/);
  }, 60_000);

  it("expiry: on access, on action and by the sweep; finished envelopes complete instead", async () => {
    const people = [
      { name: "Signer E", email: "sig-e@example.com", roleLabel: "SENDER", action: "SIGN", routingOrder: 1 },
      { name: "Signer F", email: "sig-f@example.com", roleLabel: "RECEIVER", action: "SIGN", routingOrder: 1 },
    ];
    const overdue = async (id: string) =>
      m.dbm.db.execute(m.orm.sql`update esign.envelopes set expires_at = now() - interval '1 minute' where id = ${id}`);

    // Acting after the deadline expires the envelope and refuses the signature.
    const a = await newEnvelope("Expiry A", people);
    await m.service.sendEnvelope(OWNER2, a.id, META);
    const aToken = await latestLink("sig-e@example.com");
    const aStore = new Map<string, string>();
    await verifyIn(aStore, aToken, "sig-e@example.com");
    await overdue(a.id);
    await expect(browser.run(aStore, () => m.signer.signDocument(aToken, { kind: "typed", text: "Signer E" }, metaFor()))).rejects.toThrow(
      /expired/,
    );
    expect((await envelopeRow(a.id)).status).toBe("EXPIRED");
    expect((await eventTypes(a.id)).filter((t) => t === "envelope.expired")).toHaveLength(1);
    expect(await mailsTo(OWNER2.email, "Expired: Expiry A")).toHaveLength(1);

    // Owner actions on an overdue envelope expire it too.
    const b = await newEnvelope("Expiry B", people);
    await m.service.sendEnvelope(OWNER2, b.id, META);
    await overdue(b.id);
    await expect(m.service.remindRecipients(OWNER2, b.id, META)).rejects.toThrow(/expired/);
    expect((await envelopeRow(b.id)).status).toBe("EXPIRED");
    const b2 = await newEnvelope("Expiry B2", people);
    await m.service.sendEnvelope(OWNER2, b2.id, META);
    await overdue(b2.id);
    await expect(m.service.voidEnvelope(OWNER2, b2.id, "late", META)).rejects.toThrow(/expired/);
    expect((await envelopeRow(b2.id)).status).toBe("EXPIRED");

    // Owner reads apply expiry (detail page, list).
    const c = await newEnvelope("Expiry C", people);
    await m.service.sendEnvelope(OWNER2, c.id, META);
    await overdue(c.id);
    expect((await m.queries.getEnvelopeDetail(OWNER2.id, c.id))?.envelope.status).toBe("EXPIRED");

    // The sweep: overdue in-flight envelopes expire; drafts and envelopes still in time do not.
    const d = await newEnvelope("Expiry D", people);
    await m.service.sendEnvelope(OWNER2, d.id, META);
    await overdue(d.id);
    const draft = await newEnvelope("Expiry Draft", people);
    await overdue(draft.id);
    const live = await newEnvelope("Expiry Live", people);
    await m.service.sendEnvelope(OWNER2, live.id, META);

    // Everyone signs, but building the final PDF fails (storage unavailable), then the deadline passes.
    const g = await newEnvelope("Expiry G", people);
    await m.service.sendEnvelope(OWNER2, g.id, META);
    const gs = [new Map<string, string>(), new Map<string, string>()];
    const gTokens = [await latestLink("sig-e@example.com"), await latestLink("sig-f@example.com")];
    await verifyIn(gs[0], gTokens[0], "sig-e@example.com");
    await verifyIn(gs[1], gTokens[1], "sig-f@example.com");
    await browser.run(gs[0], () => m.signer.signDocument(gTokens[0], { kind: "typed", text: "Signer E" }, metaFor()));
    const finalDir = path.join(process.env.FILE_STORAGE_DIR!, "esign-final");
    const parked = `${finalDir}.parked`;
    if (existsSync(finalDir)) renameSync(finalDir, parked);
    writeFileSync(finalDir, "not a directory");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const res = await browser.run(gs[1], () => m.signer.signDocument(gTokens[1], { kind: "typed", text: "Signer F" }, metaFor()));
      expect(res.completed).toBe(false);
    } finally {
      quiet.mockRestore();
      unlinkSync(finalDir);
      if (existsSync(parked)) renameSync(parked, finalDir);
    }
    expect((await envelopeRow(g.id)).status).toBe("PARTIALLY_SIGNED");
    await overdue(g.id);

    const sweep = await m.service.expireOverdueEnvelopes();
    expect(sweep.failed).toBe(0);
    expect(sweep.expired).toBeGreaterThanOrEqual(1);
    expect(sweep.completed).toBe(1);
    expect((await envelopeRow(d.id)).status).toBe("EXPIRED");
    expect((await envelopeRow(draft.id)).status).toBe("DRAFT");
    expect((await envelopeRow(live.id)).status).toBe("OUT_FOR_SIGNATURE");
    expect((await envelopeRow(g.id)).status).toBe("COMPLETED");
    // Idempotent: nothing left to do.
    expect(await m.service.expireOverdueEnvelopes()).toEqual({ checked: 0, expired: 0, completed: 0, failed: 0 });
    for (const id of [a.id, b.id, d.id, g.id]) expect((await m.events.verifyEnvelopeChain(id)).ok).toBe(true);
  }, 60_000);

  it("one state machine: illegal and stale transitions are refused", async () => {
    const { changeEnvelopeStatus, changeRecipientStatus } = await import("./state");
    const { WorkflowError } = await import("./workflow");
    const people = [{ name: "Signer W", email: "sig-w@example.com", roleLabel: "SENDER", action: "SIGN", routingOrder: 1 }];
    const e = await newEnvelope("State Machine", people);
    await expect(m.dbm.db.transaction((tx) => changeEnvelopeStatus(tx, { id: e.id, status: "DRAFT" }, "COMPLETED"))).rejects.toBeInstanceOf(
      WorkflowError,
    );
    await m.service.sendEnvelope(OWNER2, e.id, META);
    // The caller read DRAFT, but the row is already out for signature: detected, not overwritten.
    await expect(m.dbm.db.transaction((tx) => changeEnvelopeStatus(tx, { id: e.id, status: "DRAFT" }, "OUT_FOR_SIGNATURE"))).rejects.toMatchObject({
      status: 409,
    });
    const [r] = await m.dbm.db.select().from(m.schema.recipients).where(m.orm.eq(m.schema.recipients.envelopeId, e.id));
    // A recipient who has not verified their email cannot be marked signed.
    await expect(m.dbm.db.transaction((tx) => changeRecipientStatus(tx, r, "SIGNED"))).rejects.toThrow(/sent cannot become signed/);

    // Void is idempotent; a voided envelope cannot be voided into anything else.
    await m.service.voidEnvelope(OWNER2, e.id, "Wrong version", META);
    await expect(m.service.voidEnvelope(OWNER2, e.id, "Wrong version", META)).resolves.toBeUndefined();
    expect((await eventTypes(e.id)).filter((t) => t === "envelope.voided")).toHaveLength(1);
    await expect(m.dbm.db.transaction((tx) => changeEnvelopeStatus(tx, { id: e.id, status: "VOIDED" }, "COMPLETED"))).rejects.toThrow(
      /voided cannot become completed/,
    );
    // Draft delete twice (double click) is harmless.
    const d = await newEnvelope("State Draft", people);
    await m.service.deleteDraftEnvelope(OWNER2, d.id, META);
    await expect(m.service.deleteDraftEnvelope(OWNER2, d.id, META)).resolves.toBeUndefined();
  }, 30_000);

  it("integrity: tampered originals cannot be signed; excluded categories are blocked at send", async () => {
    const people = [{ name: "Signer I", email: "sig-i@example.com", roleLabel: "SENDER", action: "SIGN", routingOrder: 1 }];
    const e = await newEnvelope("Integrity", people);
    await m.service.sendEnvelope(OWNER2, e.id, META);
    const token = await latestLink("sig-i@example.com");
    const store = new Map<string, string>();
    await verifyIn(store, token, "sig-i@example.com");
    const row = await envelopeRow(e.id);
    const p = storagePath(row.originalStorageKey);
    const good = readFileSync(p);
    writeFileSync(p, Buffer.concat([good, Buffer.from("\n%changed")]));
    await expect(browser.run(store, () => m.signer.signDocument(token, { kind: "typed", text: "Signer I" }, metaFor()))).rejects.toMatchObject({
      status: 409,
    });
    await expect(browser.run(store, () => m.signer.openLockedDocument(token, metaFor()))).rejects.toMatchObject({ status: 409 });
    expect(await eventTypes(e.id)).toContain("document.integrity_failed");
    expect((await envelopeRow(e.id)).status).toBe("OUT_FOR_SIGNATURE");
    writeFileSync(p, good);
    await expect(browser.run(store, () => m.signer.signDocument(token, { kind: "typed", text: "Signer I" }, metaFor()))).resolves.toEqual({
      completed: true,
    });

    // IT Act First Schedule: blocked at creation and again at send.
    for (const docCategory of ["will", "trust", "negotiable_instrument", "power_of_attorney", "immovable_property"]) {
      await expect(
        m.service.createEnvelope(OWNER2, { ...baseInput, docCategory, recipients: people as never }, { kind: "upload", bytes: pdfBytes, filename: "x.pdf" }, META),
      ).rejects.toThrow(/First Schedule/);
    }
    const sneaky = await newEnvelope("Sneaky", people);
    await m.dbm.db.update(m.schema.envelopes).set({ docCategory: "power_of_attorney" }).where(m.orm.eq(m.schema.envelopes.id, sneaky.id));
    await expect(m.service.sendEnvelope(OWNER2, sneaky.id, META)).rejects.toThrow(/First Schedule/);
    expect((await envelopeRow(sneaky.id)).status).toBe("DRAFT");
    // Server-side limits even if the zod schema is bypassed.
    await expect(
      m.service.createEnvelope(OWNER2, { ...baseInput, expiryDays: 365, recipients: people as never }, { kind: "upload", bytes: pdfBytes, filename: "x.pdf" }, META),
    ).rejects.toThrow(/expiry/);
    await expect(
      m.service.createEnvelope(
        OWNER2,
        { ...baseInput, recipients: [...people, { name: "Rev", email: "rev-i@example.com", roleLabel: "LAWYER", action: "REVIEW", routingOrder: 1 }] as never },
        { kind: "upload", bytes: pdfBytes, filename: "x.pdf" },
        META,
      ),
    ).rejects.toThrow(/reviewer/);
  }, 30_000);

  it("email failures are reported to the owner and cleared by a delivered reminder", async () => {
    const { undeliveredRecipientIds } = await import("./workflow");
    const { id } = await newEnvelope("Mail Failure", [
      { name: "Down", email: "down@example.com", roleLabel: "SENDER", action: "SIGN", routingOrder: 1 },
      { name: "Up", email: "up@example.com", roleLabel: "RECEIVER", action: "SIGN", routingOrder: 1 },
    ]);
    h.failEmailTo.add("down@example.com");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sent = await m.service.sendEnvelope(OWNER2, id, META).finally(() => quiet.mockRestore());
    expect(sent).toEqual({ notified: 2, emailFailures: 1 });
    let detail = (await m.queries.getEnvelopeDetail(OWNER2.id, id))!;
    const down = detail.recipients.find((r) => r.email === "down@example.com")!;
    expect(undeliveredRecipientIds(detail.events)).toEqual([down.id]);
    expect(detail.events.find((e) => e.type === "email.failed")?.data).toMatchObject({ kind: "initial" });

    h.failEmailTo.clear();
    const reminded = await m.service.remindRecipients(OWNER2, id, META);
    expect(reminded).toEqual({ reminded: 2, emailFailures: 0 });
    detail = (await m.queries.getEnvelopeDetail(OWNER2.id, id))!;
    expect(undeliveredRecipientIds(detail.events)).toEqual([]);
    expect((await m.events.verifyEnvelopeChain(id)).ok).toBe(true);
  }, 30_000);

  it("owner actions: defineAction reads under RLS, mutations check the session", async () => {
    const actions = await import("@/app/app/sign/actions");
    const { id } = await newEnvelope("Actions", [
      { name: "Signer A", email: "sig-a@example.com", roleLabel: "SENDER", action: "SIGN", routingOrder: 1 },
    ]);
    expect(await actions.sendEnvelopeAction(id)).toEqual({ ok: false, error: "Please sign in.", fieldErrors: undefined });
    h.user = OWNER2;
    expect(await actions.sendEnvelopeAction("not-a-uuid")).toMatchObject({ ok: false });
    expect(await actions.sendEnvelopeAction(id)).toEqual({ ok: true, data: { notified: 1, emailFailures: 0 } });
    expect(await actions.sendEnvelopeAction(id)).toMatchObject({ ok: false, error: "This envelope has already been sent." });
    const chain = await actions.verifyChainAction(id);
    expect(chain.ok && chain.data.ok).toBe(true);
    expect(await actions.voidEnvelopeAction({ envelopeId: id, reason: "x" })).toMatchObject({ ok: false });
    expect(await actions.searchAdvocatesAction("a")).toEqual({ ok: true, data: [] });
    const hits = await actions.searchAdvocatesAction("Listed");
    expect(hits.ok && hits.data.map((x) => x.userId)).toEqual(["adv-1"]);

    // Another signed-in user sees nothing and can change nothing.
    h.user = { ...OWNER2, id: "owner-1" };
    expect(await actions.verifyChainAction(id)).toMatchObject({ ok: false, error: "Envelope not found." });
    expect(await actions.voidEnvelopeAction({ envelopeId: id, reason: "not mine" })).toMatchObject({ ok: false, error: "Envelope not found." });
    expect(await actions.remindAction(id)).toMatchObject({ ok: false, error: "Envelope not found." });
    h.user = OWNER2;
    expect(await actions.voidEnvelopeAction({ envelopeId: id, reason: "Superseded" })).toEqual({ ok: true, data: undefined });
    expect(await actions.retryCompletionAction(id)).toMatchObject({ ok: false });
  }, 30_000);
});
