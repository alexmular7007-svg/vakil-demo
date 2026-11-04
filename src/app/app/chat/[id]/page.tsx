import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChatView } from "@/components/chat/chat-view";
import { requireUser } from "@/lib/auth/dal";
import { composerOptions, getChat } from "@/lib/chat/queries";
import { activePlanId } from "@/lib/ai/gateway";
import { features } from "@/lib/env";
import { planById } from "@/lib/plans";
import type { ChatModeOption } from "@/lib/chat/types";

export const metadata: Metadata = { title: "Conversation" };

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/app/chat/${id}`);
  const [data, opts, plan] = await Promise.all([getChat(user.id, id), composerOptions(user.id), activePlanId(user.id)]);
  if (!data) notFound();
  return (
    <ChatView
      key={data.chat.id}
      chatId={data.chat.id}
      initialMessages={data.messages}
      initialMode={(data.chat.mode as ChatModeOption) ?? "research"}
      initialLanguage={data.chat.language === "hi" ? "hi" : "en"}
      aiEnabled={features.ai}
      canUseDeep={planById[plan].limits.modelTiers.includes("pro")}
      assistants={opts.assistants}
      prompts={opts.prompts}
      matters={opts.matters}
      preset={{ assistantId: data.chat.assistantId ?? undefined, matterId: data.chat.matterId ?? undefined }}
    />
  );
}
