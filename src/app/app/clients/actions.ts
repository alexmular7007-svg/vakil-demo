"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isValidGstin, isValidPhone, normalizeGstin, normalizePhone } from "@/lib/clients/identifiers";
import { findConflicts, type ConflictHit } from "@/lib/clients/queries";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const ClientInput = z
  .object({
    name: z.string().trim().min(2, "Enter the client's name").max(200),
    kind: z.enum(["individual", "business"]),
    phone: optionalText(30)
      .transform((v) => (v ? normalizePhone(v) : null))
      .refine((v) => v === null || isValidPhone(v), "Enter a phone number with 8 to 15 digits"),
    email: optionalText(200).refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address"),
    address: optionalText(1000),
    gstin: optionalText(20)
      .transform((v) => (v ? normalizeGstin(v) : null))
      .refine((v) => v === null || isValidGstin(v), "This GSTIN is not valid. It has 15 characters, e.g. 27AAPFU0939F1ZV"),
    notes: optionalText(5000),
  })
  // A GSTIN only matters for business clients (reverse-charge invoices).
  .transform((v) => ({ ...v, gstin: v.kind === "business" ? v.gstin : null }));

function fromForm(fd: FormData) {
  return ClientInput.parse({
    name: fd.get("name") ?? "",
    kind: fd.get("kind") || "individual",
    phone: fd.get("phone") ?? undefined,
    email: fd.get("email") ?? undefined,
    address: fd.get("address") ?? undefined,
    gstin: fd.get("gstin") ?? undefined,
    notes: fd.get("notes") ?? undefined,
  });
}

export async function createClient(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const input = fromForm(fd);
    const [row] = await withUser(user.id, (tx) => tx.insert(clients).values({ ...input, ownerId: user.id }).returning({ id: clients.id }));
    await appendAudit({ action: "client.created", actorId: user.id, entityType: "client", entityId: row.id });
    revalidatePath("/app/clients");
    return ok({ id: row.id });
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateClient(id: string, fd: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const cid = z.uuid().parse(id);
    const input = fromForm(fd);
    const res = await withUser(user.id, (tx) =>
      tx.update(clients).set({ ...input, updatedAt: new Date() }).where(eq(clients.id, cid)).returning({ id: clients.id }),
    );
    if (res.length === 0) return fail("Client not found.");
    await appendAudit({ action: "client.updated", actorId: user.id, entityType: "client", entityId: cid });
    revalidatePath("/app/clients");
    revalidatePath(`/app/clients/${cid}`);
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

/** Deletes the client record. Matters, invoices and receipts stay and are unlinked. */
export async function deleteClient(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const cid = z.uuid().parse(id);
    const res = await withUser(user.id, (tx) => tx.delete(clients).where(eq(clients.id, cid)).returning({ id: clients.id }));
    if (res.length === 0) return fail("Client not found.");
    await appendAudit({ action: "client.deleted", actorId: user.id, entityType: "client", entityId: cid });
    revalidatePath("/app/clients");
    revalidatePath("/app/fees");
    revalidatePath("/app/matters");
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

/** Conflict check: where does this name already appear in your clients and matters? */
export async function checkConflicts(name: string): Promise<ActionResult<{ query: string; hits: ConflictHit[] }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const q = z.string().trim().min(2, "Type at least 2 letters").max(120).parse(name);
    await enforceRateLimit(`conflict:${user.id}`, 60, 60);
    const hits = await findConflicts(user.id, q);
    return ok({ query: q, hits });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Type a name to check");
    return toActionError(e);
  }
}
