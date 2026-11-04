import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { desc } from "drizzle-orm";
import { Mail } from "lucide-react";
import { db } from "@/lib/db";
import { outbox } from "@/lib/db/schema";
import { env, features } from "@/lib/env";
import { Alert, EmptyState, Skeleton } from "@/components/ui/display";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dev outbox",
  robots: { index: false, follow: false },
};

const URL_RE = /(https?:\/\/[^\s<>"')]+)/g;

/** Renders plain text with http(s) links made clickable. Text is escaped by React. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} className="break-all text-primary underline underline-offset-2" rel="noreferrer">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

async function OutboxList() {
  await connection();
  if (env.isProd) notFound();
  const rows = await db.select().from(outbox).orderBy(desc(outbox.createdAt)).limit(100);
  if (rows.length === 0) {
    return <EmptyState icon={Mail} title="No emails yet" description="Sign up, request a password reset or send an e-sign envelope, then refresh." />;
  }
  return (
    <ul className="space-y-4">
      {rows.map((m) => (
        <li key={m.id} className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="font-medium text-ink">{m.subject}</h2>
            <time dateTime={m.createdAt.toISOString()} className="shrink-0 text-xs text-muted">
              {formatDateTime(m.createdAt)}
            </time>
          </div>
          <p className="text-sm text-muted">To: {m.to}</p>
          <pre className="mt-3 font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink-2">
            <Linkified text={m.text} />
          </pre>
        </li>
      ))}
    </ul>
  );
}

export default function DevOutboxPage() {
  if (env.isProd) notFound();
  return (
    <main className="mx-auto min-h-dvh max-w-3xl bg-bg px-4 py-8 sm:px-6">
      <h1 className="font-serif text-2xl font-semibold text-ink">Development outbox</h1>
      <p className="mt-1 text-sm text-muted">
        Emails the app would have sent, newest first. This page does not exist in production.
      </p>
      {features.email ? (
        <Alert tone="info" className="mt-4">
          RESEND_API_KEY is set, so new emails are sent for real and will not appear here.
        </Alert>
      ) : null}
      <div className="mt-6">
        <Suspense
          fallback={
            <div className="space-y-4" aria-busy="true" aria-label="Loading">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          }
        >
          <OutboxList />
        </Suspense>
      </div>
    </main>
  );
}
