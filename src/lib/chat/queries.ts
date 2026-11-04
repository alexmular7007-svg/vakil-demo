import "server-only";
import { asc, desc, eq, isNull, or } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { assistants, chats, matters, messages, prompts } from "@/lib/db/schema";
import type { ChatCitation, ChatMessage } from "./types";

export async function listChats(userId: string, limit = 60) {
  return withUser(userId, (tx) =>
    tx
      .select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt, pinned: chats.pinned, mode: chats.mode })
      .from(chats)
      .orderBy(desc(chats.pinned), desc(chats.updatedAt))
      .limit(limit),
  );
}

export async function getChat(userId: string, chatId: string) {
  return withUser(userId, async (tx) => {
    const [chat] = await tx.select().from(chats).where(eq(chats.id, chatId)).limit(1);
    if (!chat) return null;
    const rows = await tx.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.createdAt));
    const msgs: ChatMessage[] = rows.map((m) => ({
      id: m.id,
      role: m.role === "assistant" ? "assistant" : "user",
      text: ((m.parts as { text?: string }[]) ?? []).map((p) => p.text ?? "").join(""),
      citations: (m.citations as ChatCitation[] | null) ?? null,
      model: m.model,
      createdAt: m.createdAt.toISOString(),
    }));
    return { chat, messages: msgs };
  });
}

/** Assistants, prompts and matters offered in the composer. */
export async function composerOptions(userId: string) {
  return withUser(userId, async (tx) => {
    const [myAssistants, promptRows, matterRows] = await Promise.all([
      tx.select({ id: assistants.id, name: assistants.name, description: assistants.description }).from(assistants).orderBy(asc(assistants.name)),
      tx
        .select({ id: prompts.id, title: prompts.title, body: prompts.body, category: prompts.category, ownerId: prompts.ownerId })
        .from(prompts)
        .where(or(isNull(prompts.ownerId), eq(prompts.ownerId, userId)))
        .orderBy(asc(prompts.category), asc(prompts.title)),
      tx
        .select({ id: matters.id, title: matters.title, offenceDate: matters.offenceDate })
        .from(matters)
        .where(eq(matters.status, "open"))
        .orderBy(desc(matters.updatedAt))
        .limit(50),
    ]);
    return {
      assistants: myAssistants,
      prompts: promptRows.map((p) => ({ ...p, mine: p.ownerId === userId })),
      matters: matterRows,
    };
  });
}

export type ComposerOptions = Awaited<ReturnType<typeof composerOptions>>;
