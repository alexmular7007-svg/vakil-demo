import type { Metadata } from "next";
import { ChatView } from "@/components/chat/chat-view";
import { requireUser } from "@/lib/auth/dal";
import { composerOptions } from "@/lib/chat/queries";
import { activePlanId } from "@/lib/ai/gateway";
import { features } from "@/lib/env";
import { planById } from "@/lib/plans";

export const metadata: Metadata = { title: "Ask AI" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewChatPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser("/app/chat");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [opts, plan] = await Promise.all([composerOptions(user.id), activePlanId(user.id)]);

  // Only accept ids that belong to this user (or the built-in library).
  const assistantId = opts.assistants.find((a) => a.id === one("assistant"))?.id;
  const matterId = opts.matters.find((m) => m.id === one("matter"))?.id;
  // ?q= pre-fills the composer (e.g. "Ask AI about this judgment"); it is never sent automatically.
  const promptBody = opts.prompts.find((p) => p.id === one("prompt"))?.body ?? one("q")?.trim().slice(0, 2000) ?? undefined;

  return (
    <ChatView
      key="new"
      aiEnabled={features.ai}
      canUseDeep={planById[plan].limits.modelTiers.includes("pro")}
      initialLanguage={user.locale === "hi" ? "hi" : "en"}
      assistants={opts.assistants}
      prompts={opts.prompts}
      matters={opts.matters}
      preset={{ assistantId, matterId, promptBody }}
    />
  );
}
