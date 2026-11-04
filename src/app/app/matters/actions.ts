"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { withUser, type Tx } from "@/lib/db";
import { clients, matters } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";
import { isValidCnr, normalizeCnr } from "@/lib/clients/identifiers";
import { listClientOptions as loadClientOptions, type ClientOption } from "@/lib/clients/queries";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const MatterInput = z.object({
  title: z.string().trim().min(2, "Give the matter a title").max(200),
  clientName: optionalText(200),
  court: optionalText(200),
  caseNo: optionalText(120),
  offenceDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date"),
  notes: optionalText(5000),
});

// Practice fields. Each is only touched when the submitted form carries it, so
// older forms that do not send them leave the stored values alone.
const PracticeInput = z.object({
  clientId: z
    .union([z.uuid("Choose a client from the list"), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  opposingParty: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  cnr: z
    .string()
    .max(40)
    .optional()
    .transform((v) => (v === undefined ? undefined : normalizeCnr(v) || null))
    .refine((v) => v == null || isValidCnr(v), "A CNR has 16 letters and digits, e.g. DLHC010012342024"),
});

function present(fd: FormData, key: string) {
  return fd.has(key) ? String(fd.get(key) ?? "") : undefined;
}

function fromForm(fd: FormData) {
  const base = MatterInput.parse({
    title: fd.get("title") ?? "",
    clientName: fd.get("clientName") ?? undefined,
    court: fd.get("court") ?? undefined,
    caseNo: fd.get("caseNo") ?? undefined,
    offenceDate: fd.get("offenceDate") ?? undefined,
    notes: fd.get("notes") ?? undefined,
  });
  const practice = PracticeInput.parse({
    clientId: present(fd, "clientId"),
    opposingParty: present(fd, "opposingParty"),
    cnr: present(fd, "cnr"),
  });
  const extra = Object.fromEntries(Object.entries(practice).filter(([, v]) => v !== undefined)) as {
    clientId?: string | null;
    opposingParty?: string | null;
    cnr?: string | null;
  };
  return { ...base, ...extra };
}

/** The linked client must be the user's own (RLS hides others); fills the client name when blank. */
async function resolveClient(tx: Tx, input: ReturnType<typeof fromForm>) {
  if (!input.clientId) return input;
  const [c] = await tx.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.id, input.clientId)).limit(1);
  if (!c) throw new ClientNotFound();
  return { ...input, clientName: input.clientName ?? c.name };
}

class ClientNotFound extends Error {}

const clientNotFound = () => fail("That client was not found.", { clientId: "That client was not found." });

export async function createMatter(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const parsed = fromForm(fd);
    const row = await withUser(user.id, async (tx) => {
      const input = await resolveClient(tx, parsed);
      const [r] = await tx.insert(matters).values({ ...input, ownerId: user.id }).returning({ id: matters.id, clientId: matters.clientId });
      return r;
    });
    await appendAudit({ action: "matter.created", actorId: user.id, entityType: "matter", entityId: row.id });
    revalidatePath("/app/matters");
    if (row.clientId) revalidatePath(`/app/clients/${row.clientId}`);
    return ok({ id: row.id });
  } catch (e) {
    if (e instanceof ClientNotFound) return clientNotFound();
    return toActionError(e);
  }
}

export async function updateMatter(id: string, fd: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const mid = z.uuid().parse(id);
    const parsed = fromForm(fd);
    const res = await withUser(user.id, async (tx) => {
      const input = await resolveClient(tx, parsed);
      return tx.update(matters).set({ ...input, updatedAt: new Date() }).where(eq(matters.id, mid)).returning({ id: matters.id, clientId: matters.clientId });
    });
    if (res.length === 0) return fail("Matter not found.");
    revalidatePath(`/app/matters/${mid}`);
    revalidatePath("/app/matters");
    revalidatePath("/app/clients", "layout");
    return ok(undefined);
  } catch (e) {
    if (e instanceof ClientNotFound) return clientNotFound();
    return toActionError(e);
  }
}

/** Client options for the matter form's "Linked client" picker. */
export async function listClientOptions(): Promise<ActionResult<ClientOption[]>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    return ok(await loadClientOptions(user.id));
  } catch (e) {
    return toActionError(e);
  }
}

export async function setMatterStatus(id: string, status: "open" | "closed"): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const mid = z.uuid().parse(id);
    const s = z.enum(["open", "closed"]).parse(status);
    await withUser(user.id, (tx) => tx.update(matters).set({ status: s, updatedAt: new Date() }).where(eq(matters.id, mid)));
    revalidatePath(`/app/matters/${mid}`);
    revalidatePath("/app/matters");
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteMatter(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const mid = z.uuid().parse(id);
    await withUser(user.id, (tx) => tx.delete(matters).where(eq(matters.id, mid)));
    await appendAudit({ action: "matter.deleted", actorId: user.id, entityType: "matter", entityId: mid });
    revalidatePath("/app/matters");
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}
