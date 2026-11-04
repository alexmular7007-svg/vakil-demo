import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, isNull, or } from "drizzle-orm";
import { Bot, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { assistants, prompts } from "@/lib/db/schema";
import { Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { PromptManager } from "@/components/assistants/prompt-manager";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "My assistants" };

const tierLabel: Record<string, string> = { fast: "Fast", standard: "Standard", pro: "Deep" };

export default async function AssistantsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/app/assistants");
  const tab = (await searchParams).tab === "prompts" ? "prompts" : "assistants";
  const data = await withUser(user.id, async (tx) => ({
    assistants: await tx.select().from(assistants).orderBy(asc(assistants.name)),
    prompts: await tx
      .select({ id: prompts.id, title: prompts.title, body: prompts.body, category: prompts.category, ownerId: prompts.ownerId })
      .from(prompts)
      .where(or(isNull(prompts.ownerId), eq(prompts.ownerId, user.id)))
      .orderBy(asc(prompts.category), asc(prompts.title)),
  }));

  return (
    <>
      <PageHeader eyebrow="AI & research" icon={Bot}
        title="My assistants"
        description="Build your own assistants with standing instructions and knowledge files, and keep a library of prompts you reuse."
        actions={
          tab === "assistants" ? (
            <Button asChild>
              <Link href="/app/assistants/new">
                <Plus /> New assistant
              </Link>
            </Button>
          ) : null
        }
      />
      <div role="tablist" className="mb-6 inline-flex rounded-lg bg-surface-2 p-1">
        {[
          { v: "assistants", label: "Assistants" },
          { v: "prompts", label: "Prompts" },
        ].map((t) => (
          <Link
            key={t.v}
            role="tab"
            aria-selected={tab === t.v}
            href={t.v === "assistants" ? "/app/assistants" : "/app/assistants?tab=prompts"}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === t.v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "prompts" ? (
        <PromptManager prompts={data.prompts.map((p) => ({ ...p, mine: p.ownerId === user.id }))} />
      ) : data.assistants.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No assistants yet"
          description="An assistant remembers how you like to work: a bail-drafting helper, a contract reviewer for your clients, a Hindi explainer."
          action={
            <Button asChild>
              <Link href="/app/assistants/new">
                <Plus /> Create your first assistant
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.assistants.map((a) => (
            <Link key={a.id} href={`/app/assistants/${a.id}`} className="group rounded-lg border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Bot className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink group-hover:text-primary">{a.name}</p>
                  <p className="text-xs text-muted">v{a.version} · updated {formatDate(a.updatedAt)}</p>
                </div>
              </div>
              {a.description ? <p className="mt-3 line-clamp-2 text-sm text-muted">{a.description}</p> : null}
              <div className="mt-3 flex gap-1.5">
                <Badge>{tierLabel[a.modelTier] ?? a.modelTier}</Badge>
                {a.knowledgeDocumentIds.length > 0 ? <Badge tone="info">{a.knowledgeDocumentIds.length} files</Badge> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
