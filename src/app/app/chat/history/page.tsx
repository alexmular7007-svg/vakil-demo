import type { Metadata } from "next";
import { History } from "lucide-react";
import { PageHeader } from "@/components/ui/display";
import { ChatHistory } from "@/components/chat/chat-history";
import { requireUser } from "@/lib/auth/dal";
import { listChats } from "@/lib/chat/queries";

export const metadata: Metadata = { title: "Conversations" };

export default async function ChatHistoryPage() {
  const user = await requireUser("/app/chat/history");
  const items = await listChats(user.id, 200);
  return (
    <>
      <PageHeader eyebrow="AI & research" icon={History} title="Conversations" description="Your Ask AI history. Pinned conversations stay at the top." />
      <ChatHistory items={items} />
    </>
  );
}
