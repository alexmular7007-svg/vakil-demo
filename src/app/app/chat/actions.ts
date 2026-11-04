"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ActionError, type ActionResult } from "@/lib/action";
import { defineAction } from "@/lib/define-action";
import { chats, feedback, messages } from "@/lib/db/schema";

const Id = z.uuid({ message: "Invalid id." });

/** The chat sidebar lives in the /app/chat layout, so refresh the whole layout after a change. */
function refreshChatLayout<T>(r: ActionResult<T>): ActionResult<T> {
  if (r.ok) revalidatePath("/app/chat", "layout");
  return r;
}

/* ----------------------------- rename / pin / delete ----------------------------- */

const renameChatAction = defineAction({
  input: z.object({ chatId: Id, title: z.string().trim().min(1, "Give the conversation a title").max(120) }),
  rateLimit: { name: "chat-edit", limit: 60, windowSeconds: 60 },
  run: async ({ tx, input }) => {
    const rows = await tx
      .update(chats)
      .set({ title: input.title, updatedAt: new Date() })
      .where(eq(chats.id, input.chatId))
      .returning({ id: chats.id });
    if (!rows.length) throw new ActionError("Conversation not found.");
    return undefined;
  },
});

export async function renameChat(chatId: string, title: string): Promise<ActionResult> {
  return refreshChatLayout(await renameChatAction({ chatId, title }));
}

const togglePinChatAction = defineAction({
  input: z.object({ chatId: Id, pinned: z.boolean() }),
  rateLimit: { name: "chat-edit", limit: 60, windowSeconds: 60 },
  run: async ({ tx, input }) => {
    const rows = await tx.update(chats).set({ pinned: input.pinned }).where(eq(chats.id, input.chatId)).returning({ id: chats.id });
    if (!rows.length) throw new ActionError("Conversation not found.");
    return undefined;
  },
});

export async function togglePinChat(chatId: string, pinned: boolean): Promise<ActionResult> {
  return refreshChatLayout(await togglePinChatAction({ chatId, pinned }));
}

const deleteChatAction = defineAction({
  input: z.object({ chatId: Id }),
  rateLimit: { name: "chat-edit", limit: 60, windowSeconds: 60 },
  run: async ({ tx, input }) => {
    const rows = await tx.delete(chats).where(eq(chats.id, input.chatId)).returning({ id: chats.id });
    if (!rows.length) throw new ActionError("Conversation not found.");
    return undefined;
  },
  audit: (input) => ({ action: "chat.deleted", entityType: "chat", entityId: input.chatId }),
});

export async function deleteChat(chatId: string): Promise<ActionResult> {
  return refreshChatLayout(await deleteChatAction({ chatId }));
}

/* ----------------------------- feedback ----------------------------- */

const sendFeedbackAction = defineAction({
  input: z.object({
    messageId: Id,
    rating: z.enum(["up", "down"]),
    reason: z
      .string()
      .optional()
      .transform((v) => v?.trim().slice(0, 200) || null),
  }),
  rateLimit: { name: "chat-feedback", limit: 30, windowSeconds: 60 },
  run: async ({ user, tx, input }) => {
    // Only the user's own answers (row-level security hides everyone else's messages).
    const [m] = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, input.messageId), eq(messages.role, "assistant")))
      .limit(1);
    if (!m) throw new ActionError("That answer was not found.");
    await tx.insert(feedback).values({ messageId: input.messageId, userId: user.id, rating: input.rating, reason: input.reason });
    return undefined;
  },
});

export async function sendFeedback(messageId: string, rating: "up" | "down", reason?: string): Promise<ActionResult> {
  return sendFeedbackAction({ messageId, rating, reason });
}
