"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { assistants, documents, prompts } from "@/lib/db/schema";
import { activePlanId } from "@/lib/ai/gateway";
import { planById } from "@/lib/plans";
import { appendAudit } from "@/lib/audit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";

const AssistantInput = z.object({
  name: z.string().trim().min(2, "Name the assistant").max(80),
  description: z.string().trim().max(300).default(""),
  instructions: z.string().trim().min(20, "Write at least a sentence of instructions").max(6000),
  modelTier: z.enum(["fast", "standard", "pro"]).default("standard"),
  icon: z.string().max(20).default("scale"),
  knowledgeDocumentIds: z.array(z.uuid()).max(20).default([]),
});

function parseAssistant(fd: FormData) {
  return AssistantInput.parse({
    name: fd.get("name") ?? "",
    description: fd.get("description") ?? "",
    instructions: fd.get("instructions") ?? "",
    modelTier: fd.get("modelTier") ?? "standard",
    knowledgeDocumentIds: fd.getAll("knowledgeDocumentIds").map(String),
  });
}

export async function saveAssistant(id: string | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const input = parseAssistant(fd);
    const plan = planById[await activePlanId(user.id)];
    if (!plan.limits.modelTiers.includes(input.modelTier)) input.modelTier = "standard";

    const result = await withUser(user.id, async (tx) => {
      // Knowledge files must be the user's own, ready documents (RLS hides others).
      if (input.knowledgeDocumentIds.length > 0) {
        const owned = await tx
          .select({ id: documents.id })
          .from(documents)
          .where(and(sql`${documents.id} = any(${input.knowledgeDocumentIds}::uuid[])`, eq(documents.status, "ready")));
        input.knowledgeDocumentIds = owned.map((d) => d.id);
      }
      if (id) {
        const aid = z.uuid().parse(id);
        const [row] = await tx
          .update(assistants)
          .set({ ...input, version: sql`${assistants.version} + 1`, updatedAt: new Date() })
          .where(eq(assistants.id, aid))
          .returning({ id: assistants.id });
        return row ?? null;
      }
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(assistants);
      if (count >= plan.limits.customAssistants) throw new LimitError(plan.limits.customAssistants);
      const [row] = await tx.insert(assistants).values({ ...input, ownerId: user.id }).returning({ id: assistants.id });
      return row;
    });
    if (!result) return fail("Assistant not found.");
    await appendAudit({ action: id ? "assistant.updated" : "assistant.created", actorId: user.id, entityType: "assistant", entityId: result.id });
    revalidatePath("/app/assistants");
    return ok({ id: result.id });
  } catch (e) {
    if (e instanceof LimitError) return fail(e.message);
    return toActionError(e);
  }
}

class LimitError extends Error {
  constructor(n: number) {
    super(`Your plan allows ${n} custom assistant${n === 1 ? "" : "s"}. Upgrade to create more.`);
  }
}

export async function deleteAssistant(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const aid = z.uuid().parse(id);
    await withUser(user.id, (tx) => tx.delete(assistants).where(eq(assistants.id, aid)));
    revalidatePath("/app/assistants");
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

const PromptInput = z.object({
  title: z.string().trim().min(2, "Give the prompt a title").max(120),
  body: z.string().trim().min(5, "Write the prompt").max(4000),
  category: z.string().trim().max(40).default("General"),
});

export async function savePrompt(id: string | null, fd: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const input = PromptInput.parse({ title: fd.get("title") ?? "", body: fd.get("body") ?? "", category: fd.get("category") || "General" });
    await withUser(user.id, async (tx) => {
      if (id) {
        await tx.update(prompts).set(input).where(and(eq(prompts.id, z.uuid().parse(id)), eq(prompts.ownerId, user.id)));
      } else {
        await tx.insert(prompts).values({ ...input, ownerId: user.id, visibility: "private" });
      }
    });
    revalidatePath("/app/assistants");
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function copyLibraryPrompt(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const pid = z.uuid().parse(id);
    await withUser(user.id, async (tx) => {
      const [p] = await tx.select().from(prompts).where(and(eq(prompts.id, pid), isNull(prompts.ownerId))).limit(1);
      if (!p) throw new Error("not found");
      await tx.insert(prompts).values({ title: `${p.title} (my copy)`, body: p.body, category: p.category, ownerId: user.id, visibility: "private" });
    });
    revalidatePath("/app/assistants");
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function deletePrompt(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const pid = z.uuid().parse(id);
    await withUser(user.id, (tx) => tx.delete(prompts).where(and(eq(prompts.id, pid), eq(prompts.ownerId, user.id))));
    revalidatePath("/app/assistants");
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}
