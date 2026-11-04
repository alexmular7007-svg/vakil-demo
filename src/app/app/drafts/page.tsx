import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { FilePen, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { drafts, matters } from "@/lib/db/schema";
import { getTemplate } from "@/lib/drafting/catalog";
import { draftTemplateSlug } from "@/lib/drafting/queries";
import { istDate as formatDate } from "@/lib/drafting/format";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { DraftFilters } from "@/components/drafting/draft-filters";

export const metadata: Metadata = { title: "Drafts" };

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export default async function DraftsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/app/drafts");
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 100);
  const status = sp.status === "draft" || sp.status === "final" ? sp.status : "";

  const where: SQL[] = [];
  if (q) where.push(ilike(drafts.title, `%${escapeLike(q)}%`));
  if (status) where.push(eq(drafts.status, status));

  const rows = await withUser(user.id, (tx) =>
    tx
      .select({
        id: drafts.id,
        title: drafts.title,
        status: drafts.status,
        language: drafts.language,
        version: drafts.version,
        templateSlug: drafts.templateSlug,
        inputs: drafts.inputs,
        updatedAt: drafts.updatedAt,
        matterTitle: matters.title,
      })
      .from(drafts)
      .leftJoin(matters, eq(drafts.matterId, matters.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(drafts.updatedAt))
      .limit(200),
  );

  const items = rows.map((r) => {
    const slug = draftTemplateSlug(r);
    return { ...r, templateTitle: slug ? (getTemplate(slug)?.title ?? "Template") : "Blank draft" };
  });
  const filtered = Boolean(q || status);

  return (
    <div>
      <PageHeader eyebrow="Drafting & signing" icon={FilePen}
        title="Drafts"
        description="Notices, applications, petitions and agreements in Indian formats. Every save is kept as a version."
        actions={
          <Button asChild>
            <Link href="/app/drafts/new">
              <Plus /> New draft
            </Link>
          </Button>
        }
      />

      <div className="mb-4">
        <DraftFilters q={q} status={status} />
      </div>

      {items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={FilePen}
            title="No drafts match"
            description="Try a different title or status."
            action={
              <Button asChild variant="outline">
                <Link href="/app/drafts">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={FilePen}
            title="No drafts yet"
            description="Start from a template such as a cheque bounce notice or bail application, or begin with a blank page."
            action={
              <Button asChild>
                <Link href="/app/drafts/new">
                  <Plus /> Start a draft
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          <p className="mb-2 text-sm text-muted" aria-live="polite">
            {items.length === 200 ? "Showing the 200 most recent drafts" : `${items.length} draft${items.length === 1 ? "" : "s"}`}
          </p>

          {/* Phones: cards */}
          <ul className="grid gap-2 md:hidden">
            {items.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/app/drafts/${d.id}`}
                  className="block rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-medium text-ink" lang={d.language === "hi" ? "hi" : undefined}>
                      {d.title}
                    </span>
                    <StatusBadge status={d.status} />
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">{d.templateTitle}</p>
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    <span>v{d.version}</span>
                    <span>Updated {formatDate(d.updatedAt)}</span>
                    {d.matterTitle ? <span className="truncate">Matter: {d.matterTitle}</span> : null}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablet and desktop: table */}
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <Th>Title</Th>
                  <Th className="hidden lg:table-cell">Template</Th>
                  <Th>Matter</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Version</Th>
                  <Th className="text-right">Updated</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-2/60">
                    <Td className="max-w-[22rem]">
                      <Link
                        href={`/app/drafts/${d.id}`}
                        className="font-medium text-ink hover:text-primary hover:underline"
                        lang={d.language === "hi" ? "hi" : undefined}
                      >
                        {d.title}
                      </Link>
                      <span className="block truncate text-xs text-muted lg:hidden">{d.templateTitle}</span>
                    </Td>
                    <Td className="hidden max-w-[16rem] truncate lg:table-cell">{d.templateTitle}</Td>
                    <Td className="max-w-[12rem] truncate">{d.matterTitle ?? <span className="text-muted">—</span>}</Td>
                    <Td>
                      <StatusBadge status={d.status} />
                    </Td>
                    <Td className="text-right tabular-nums">v{d.version}</Td>
                    <Td className="text-right whitespace-nowrap">{formatDate(d.updatedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return status === "final" ? <Badge tone="success">Final</Badge> : <Badge>In progress</Badge>;
}
