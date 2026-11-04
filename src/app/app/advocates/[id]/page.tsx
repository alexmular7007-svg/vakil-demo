import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { getListedAdvocate } from "@/lib/directory/advocates";
import { Alert, Card } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { AdvocateCard } from "@/components/directory/advocate-card";
import { BciNotice } from "@/components/directory/bci-notice";
import { ConsultationForm } from "@/components/directory/consultation-form";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Advocate" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdvocateProfilePage({ params, searchParams }: Props) {
  const user = await requireUser("/app/advocates");
  const [{ id: rawId }, sp] = await Promise.all([params, searchParams]);
  const id = rawId.slice(0, 100);
  const chatParam = (Array.isArray(sp.chat) ? sp.chat[0] : sp.chat) ?? "";

  const [advocate, linkedChat] = await Promise.all([
    getListedAdvocate(user.id, id),
    UUID_RE.test(chatParam)
      ? withUser(user.id, (tx) => tx.select({ id: chats.id, title: chats.title }).from(chats).where(eq(chats.id, chatParam)).limit(1)).then(
          (r) => r[0] ?? null,
        )
      : Promise.resolve(null),
  ]);
  if (!advocate) notFound();

  const isSelf = advocate.userId === user.id;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="sr-only">{advocate.displayName}, verified advocate</h1>
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/app/advocates${linkedChat ? `?chat=${linkedChat.id}` : ""}`}>
          <ArrowLeft /> All advocates
        </Link>
      </Button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-4">
          <AdvocateCard advocate={advocate} headingLevel="h2" />
          {advocate.bio ? (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-ink">About the practice</h3>
              <p className="mt-2 text-sm whitespace-pre-line text-ink-2">{advocate.bio}</p>
            </Card>
          ) : null}
        </div>

        <Card className="p-5 sm:p-6">
          <h2 className="font-serif text-xl font-semibold text-ink">Request a consultation</h2>
          {isSelf ? (
            <Alert tone="info" className="mt-4">
              This is your own listing. Requests from others arrive in your{" "}
              <Link href="/app/advocates/inbox" className="font-medium text-primary underline">
                consultation inbox
              </Link>
              .
            </Alert>
          ) : !advocate.acceptsConsultations ? (
            <Alert tone="info" className="mt-4">
              {advocate.displayName} is not accepting consultation requests through Vaakil AI right now.
            </Alert>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-ink-2">
                {advocate.displayName} will see your name, subject and summary, and can accept or decline. Any engagement and
                fees are agreed directly between you and the advocate; Vaakil AI takes no fee or commission.
              </p>
              {linkedChat ? (
                <p className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-2">
                  <MessageSquareText className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 truncate">
                    Linked conversation: <span className="font-medium text-ink">{linkedChat.title}</span>
                  </span>
                </p>
              ) : null}
              <ConsultationForm
                advocateId={advocate.userId}
                advocateName={advocate.displayName}
                chatId={linkedChat?.id ?? null}
                defaultSubject={linkedChat ? linkedChat.title.slice(0, 140) : ""}
              />
            </div>
          )}
          <p className="mt-6 text-xs text-muted">{site.disclaimer}</p>
        </Card>
      </div>

      <BciNotice />
    </div>
  );
}
