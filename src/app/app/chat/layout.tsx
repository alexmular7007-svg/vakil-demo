import { Suspense } from "react";
import { Skeleton } from "@/components/ui/display";
import { ChatHistory } from "@/components/chat/chat-history";
import { requireUser } from "@/lib/auth/dal";
import { listChats } from "@/lib/chat/queries";

async function HistoryColumn() {
  const user = await requireUser("/app/chat");
  const items = await listChats(user.id);
  return <ChatHistory items={items} className="h-full" />;
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-6">
      <aside className="hidden lg:flex lg:h-[calc(100dvh-104px)] lg:flex-col" aria-label="Conversations">
        <Suspense fallback={<Skeleton className="h-full w-full" />}>
          <HistoryColumn />
        </Suspense>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
