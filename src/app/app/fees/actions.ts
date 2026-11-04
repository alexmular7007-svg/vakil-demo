"use server";

import { revalidatePath } from "next/cache";
import { and, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { clients, feeReceipts, invoices, matters, practiceProfiles } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";
import { isValidGstin, isValidPhone, normalizeGstin, normalizePhone } from "@/lib/clients/identifiers";
import { financialYearOf, formatInvoiceNumber, INVOICE_PREFIX_RE, isIsoDate, istToday, nextInvoiceSeq, normalizeInvoicePrefix } from "@/lib/fees/fy";
import { computeInvoiceTotals, GST_MODES, MAX_AMOUNT_PAISE, parseRupeesToPaise } from "@/lib/fees/money";
import { RECEIPT_MODES, statusAfterPayments } from "@/lib/fees/status";
import { isValidVpa, normalizeVpa } from "@/lib/fees/upi";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const optionalId = z
  .union([z.uuid(), z.literal("")])
  .nullish()
  .transform((v) => v || null);

const isoDate = (msg: string) => z.string().trim().refine(isIsoDate, msg);

const amountField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = parseRupeesToPaise(v);
    if (p === null) {
      ctx.addIssue({ code: "custom", message: "Enter an amount in rupees, e.g. 25000 or 25000.50" });
      return z.NEVER;
    }
    return p;
  })
  .refine((p) => p > 0, "Amount must be more than zero")
  .refine((p) => p <= MAX_AMOUNT_PAISE, "That amount is too large");

const gstinField = optionalText(20)
  .transform((v) => (v ? normalizeGstin(v) : null))
  .refine((v) => v === null || isValidGstin(v), "This GSTIN is not valid. It has 15 characters, e.g. 27AAPFU0939F1ZV");

const emailField = optionalText(200).refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address");

const InvoiceInput = z
  .object({
    clientId: optionalId,
    matterId: optionalId,
    billTo: z.object({
      name: z.string().trim().min(2, "Enter who the memo is addressed to").max(200),
      address: optionalText(1000),
      gstin: gstinField,
      email: emailField,
    }),
    items: z
      .array(z.object({ description: z.string().trim().min(2, "Describe the work").max(500), amount: amountField }))
      .min(1, "Add at least one item")
      .max(30, "At most 30 items"),
    gstMode: z.enum(GST_MODES),
    gstRate: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? Number(v) : 18)),
    issueDate: isoDate("Choose the issue date"),
    dueDate: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || isIsoDate(v), "Choose a valid due date"),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.dueDate && v.dueDate < v.issueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "The due date cannot be before the issue date" });
    if (v.gstMode === "forward" && (!Number.isFinite(v.gstRate) || v.gstRate <= 0 || v.gstRate > 28)) {
      ctx.addIssue({ code: "custom", path: ["gstRate"], message: "Enter a GST rate between 0 and 28%" });
    }
    const total = v.items.reduce((a, i) => a + i.amount, 0);
    if (total > MAX_AMOUNT_PAISE) ctx.addIssue({ code: "custom", path: ["items"], message: "The total is too large" });
  });

export type InvoiceDraftInput = {
  clientId?: string;
  matterId?: string;
  billTo: { name: string; address?: string; gstin?: string; email?: string };
  items: { description: string; amount: string }[];
  gstMode: string;
  gstRate?: string;
  issueDate: string;
  dueDate?: string;
  notes?: string;
};

function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    if ((cur as { code?: unknown }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

class InputError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

function revalidateFees(extra: (string | null | undefined)[] = []) {
  revalidatePath("/app/fees");
  revalidatePath("/app/clients");
  revalidatePath("/app");
  for (const p of extra) if (p) revalidatePath(p);
}

/** Issues a fee memo with the next number in the owner's series for that financial year. */
export async function createInvoice(raw: InvoiceDraftInput): Promise<ActionResult<{ id: string; number: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const input = InvoiceInput.parse(raw);
    const amounts = input.items.map((i) => i.amount);
    const totals = computeInvoiceTotals(amounts, input.gstMode, Math.round(input.gstRate * 100));
    const fy = financialYearOf(input.issueDate);
    const billTo = Object.fromEntries(Object.entries(input.billTo).filter(([, v]) => v !== null)) as {
      name: string;
      address?: string;
      gstin?: string;
      email?: string;
    };

    // The unique (owner, number) constraint settles races: on a clash, re-read and retry.
    for (let attempt = 0; ; attempt++) {
      try {
        const created = await withUser(user.id, async (tx) => {
          let clientId = input.clientId;
          if (clientId) {
            const [c] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
            if (!c) throw new InputError("That client was not found.", "clientId");
          }
          if (input.matterId) {
            const [m] = await tx.select({ id: matters.id, clientId: matters.clientId }).from(matters).where(eq(matters.id, input.matterId)).limit(1);
            if (!m) throw new InputError("That matter was not found.", "matterId");
            clientId ??= m.clientId;
          }
          const [profile] = await tx
            .select({ invoicePrefix: practiceProfiles.invoicePrefix, gstin: practiceProfiles.gstin })
            .from(practiceProfiles)
            .where(eq(practiceProfiles.ownerId, user.id))
            .limit(1);
          if (input.gstMode === "forward" && !profile?.gstin) {
            throw new InputError("Add your GSTIN in the billing profile before charging GST.", "gstMode");
          }
          const used = await tx
            .select({ number: invoices.number })
            .from(invoices)
            .where(and(eq(invoices.ownerId, user.id), like(invoices.number, `%/${fy.label}/%`)));
          const number = formatInvoiceNumber(profile?.invoicePrefix || "INV", fy.label, nextInvoiceSeq(used.map((u) => u.number), fy.label));
          const [row] = await tx
            .insert(invoices)
            .values({
              ownerId: user.id,
              clientId,
              matterId: input.matterId,
              number,
              issueDate: input.issueDate,
              dueDate: input.dueDate,
              billTo,
              items: input.items.map((i) => ({ description: i.description, amountPaise: i.amount })),
              subtotalPaise: totals.subtotalPaise,
              gstMode: input.gstMode,
              gstRateBp: totals.gstRateBp,
              taxPaise: totals.taxPaise,
              totalPaise: totals.totalPaise,
              status: "issued",
              notes: input.notes,
            })
            .returning({ id: invoices.id, number: invoices.number, clientId: invoices.clientId });
          return row;
        });
        await appendAudit({
          action: "invoice.issued",
          actorId: user.id,
          entityType: "invoice",
          entityId: created.id,
          data: { number: created.number, totalPaise: totals.totalPaise, gstMode: input.gstMode },
        });
        revalidateFees([created.clientId ? `/app/clients/${created.clientId}` : null]);
        return ok({ id: created.id, number: created.number });
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 5) continue;
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof InputError) return fail(e.message, e.field ? { [e.field]: e.message } : undefined);
    return toActionError(e);
  }
}

const ReceiptInput = z.object({
  amount: amountField,
  receivedOn: isoDate("Choose the date you received it"),
  mode: z.enum(RECEIPT_MODES),
  reference: optionalText(120),
  notes: optionalText(500),
});

/** Records a professional-fee receipt against an invoice and moves it to partly paid / paid. */
export async function recordReceipt(invoiceId: string, fd: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const id = z.uuid().parse(invoiceId);
    const input = ReceiptInput.parse({
      amount: fd.get("amount") ?? "",
      receivedOn: fd.get("receivedOn") ?? "",
      mode: fd.get("mode") ?? "",
      reference: fd.get("reference") ?? undefined,
      notes: fd.get("notes") ?? undefined,
    });
    if (input.receivedOn > istToday()) return fail("The date cannot be in the future.", { receivedOn: "The date cannot be in the future." });

    const res = await withUser(user.id, async (tx) => {
      // Row lock: two receipts recorded at once cannot both pass the balance check.
      const [inv] = await tx
        .select({ id: invoices.id, status: invoices.status, totalPaise: invoices.totalPaise, clientId: invoices.clientId })
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1)
        .for("update");
      if (!inv) throw new InputError("Invoice not found.");
      if (inv.status !== "issued" && inv.status !== "partly_paid") {
        throw new InputError(inv.status === "paid" ? "This invoice is already fully paid." : "Receipts cannot be recorded on a cancelled invoice.");
      }
      const [{ paid }] = await tx
        .select({ paid: sql<number>`coalesce(sum(${feeReceipts.amountPaise}), 0)`.mapWith(Number) })
        .from(feeReceipts)
        .where(eq(feeReceipts.invoiceId, id));
      const balance = inv.totalPaise - paid;
      if (input.amount > balance) throw new InputError("This is more than the balance due on the invoice.", "amount");
      const [receipt] = await tx
        .insert(feeReceipts)
        .values({
          ownerId: user.id,
          invoiceId: id,
          clientId: inv.clientId,
          amountPaise: input.amount,
          receivedOn: input.receivedOn,
          mode: input.mode,
          reference: input.reference,
          notes: input.notes,
        })
        .returning({ id: feeReceipts.id });
      const status = statusAfterPayments(inv.totalPaise, paid + input.amount);
      await tx.update(invoices).set({ status, updatedAt: new Date() }).where(eq(invoices.id, id));
      return { receiptId: receipt.id, status, clientId: inv.clientId };
    });
    await appendAudit({
      action: "fee_receipt.recorded",
      actorId: user.id,
      entityType: "invoice",
      entityId: id,
      data: { receiptId: res.receiptId, amountPaise: input.amount, mode: input.mode, status: res.status },
    });
    revalidateFees([`/app/fees/${id}`, res.clientId ? `/app/clients/${res.clientId}` : null]);
    return ok(undefined);
  } catch (e) {
    if (e instanceof InputError) return fail(e.message, e.field ? { [e.field]: e.message } : undefined);
    return toActionError(e);
  }
}

/** Removes a receipt recorded by mistake and recalculates the invoice status. */
export async function deleteReceipt(receiptId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const rid = z.uuid().parse(receiptId);
    const res = await withUser(user.id, async (tx) => {
      const [r] = await tx
        .delete(feeReceipts)
        .where(eq(feeReceipts.id, rid))
        .returning({ invoiceId: feeReceipts.invoiceId, amountPaise: feeReceipts.amountPaise, clientId: feeReceipts.clientId });
      if (!r) throw new InputError("Receipt not found.");
      if (r.invoiceId) {
        const [inv] = await tx.select({ status: invoices.status, totalPaise: invoices.totalPaise }).from(invoices).where(eq(invoices.id, r.invoiceId)).limit(1).for("update");
        if (inv && inv.status !== "cancelled") {
          const [{ paid }] = await tx
            .select({ paid: sql<number>`coalesce(sum(${feeReceipts.amountPaise}), 0)`.mapWith(Number) })
            .from(feeReceipts)
            .where(eq(feeReceipts.invoiceId, r.invoiceId));
          await tx.update(invoices).set({ status: statusAfterPayments(inv.totalPaise, paid), updatedAt: new Date() }).where(eq(invoices.id, r.invoiceId));
        }
      }
      return r;
    });
    await appendAudit({
      action: "fee_receipt.deleted",
      actorId: user.id,
      entityType: "invoice",
      entityId: res.invoiceId,
      data: { receiptId: rid, amountPaise: res.amountPaise },
    });
    revalidateFees([res.invoiceId ? `/app/fees/${res.invoiceId}` : null, res.clientId ? `/app/clients/${res.clientId}` : null]);
    return ok(undefined);
  } catch (e) {
    if (e instanceof InputError) return fail(e.message);
    return toActionError(e);
  }
}

/** Cancels an invoice. Its number stays used, so the series has no gaps or reuse. */
export async function cancelInvoice(invoiceId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const id = z.uuid().parse(invoiceId);
    const res = await withUser(user.id, async (tx) => {
      const [inv] = await tx
        .select({ status: invoices.status, number: invoices.number, clientId: invoices.clientId })
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1)
        .for("update");
      if (!inv) throw new InputError("Invoice not found.");
      if (inv.status === "cancelled") return inv;
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(feeReceipts).where(eq(feeReceipts.invoiceId, id));
      if (n > 0) throw new InputError("Receipts are recorded against this invoice. Remove them first if they were entered by mistake.");
      await tx.update(invoices).set({ status: "cancelled", updatedAt: new Date() }).where(eq(invoices.id, id));
      return inv;
    });
    await appendAudit({ action: "invoice.cancelled", actorId: user.id, entityType: "invoice", entityId: id, data: { number: res.number } });
    revalidateFees([`/app/fees/${id}`, res.clientId ? `/app/clients/${res.clientId}` : null]);
    return ok(undefined);
  } catch (e) {
    if (e instanceof InputError) return fail(e.message);
    return toActionError(e);
  }
}

const ProfileInput = z.object({
  displayName: optionalText(200),
  address: optionalText(1000),
  phone: optionalText(30)
    .transform((v) => (v ? normalizePhone(v) : null))
    .refine((v) => v === null || isValidPhone(v), "Enter a phone number with 8 to 15 digits"),
  email: emailField,
  gstin: gstinField,
  upiId: optionalText(120)
    .transform((v) => (v ? normalizeVpa(v) : null))
    .refine((v) => v === null || isValidVpa(v), "Enter a UPI ID like name@bank"),
  invoicePrefix: z
    .string()
    .optional()
    .transform((v) => normalizeInvoicePrefix(v ?? "") || "INV")
    .refine((v) => INVOICE_PREFIX_RE.test(v), "Use letters, digits and hyphens, starting with a letter or digit"),
});

export async function saveBillingProfile(fd: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const input = ProfileInput.parse({
      displayName: fd.get("displayName") ?? undefined,
      address: fd.get("address") ?? undefined,
      phone: fd.get("phone") ?? undefined,
      email: fd.get("email") ?? undefined,
      gstin: fd.get("gstin") ?? undefined,
      upiId: fd.get("upiId") ?? undefined,
      invoicePrefix: fd.get("invoicePrefix") ?? undefined,
    });
    await withUser(user.id, (tx) =>
      tx
        .insert(practiceProfiles)
        .values({ ownerId: user.id, ...input })
        .onConflictDoUpdate({ target: practiceProfiles.ownerId, set: { ...input, updatedAt: new Date() } }),
    );
    await appendAudit({
      action: "practice_profile.updated",
      actorId: user.id,
      entityType: "practice_profile",
      entityId: user.id,
      data: { hasGstin: Boolean(input.gstin), hasUpi: Boolean(input.upiId), invoicePrefix: input.invoicePrefix },
    });
    revalidatePath("/app/fees", "layout");
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}
