import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, BookOpenText, ExternalLink } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/guard";
import { db } from "@/lib/db";
import { acts, sectionRevisions, sections, user as userTable } from "@/lib/db/schema";
import { formatActDate } from "@/lib/corpus/acts";
import { sectionFingerprint } from "@/lib/corpus/plan";
import { Badge, Card, PageHeader, SectionHeader } from "@/components/ui/display";
import { ActDialog } from "@/components/library/act-dialog";
import { ActPaste } from "@/components/library/act-paste";
import { RevisionList } from "@/components/library/revision-list";
import { SectionManager } from "@/components/library/section-manager";
import { TrackedSwitch } from "@/components/library/tracked-switch";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Act" };

export default async function AdminActPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id: raw } = await params;
  const id = decodeURIComponent(raw).toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,15}$/.test(id)) notFound();

  const [act] = await db.select().from(acts).where(eq(acts.id, id)).limit(1);
  if (!act) notFound();
  const [rows, revs] = await Promise.all([
    db
      .select({ sectionNo: sections.sectionNo, heading: sections.heading, chapter: sections.chapter, text: sections.text })
      .from(sections)
      .where(eq(sections.actId, id))
      .orderBy(asc(sections.sortKey)),
    db.select().from(sectionRevisions).where(eq(sectionRevisions.actId, id)).orderBy(desc(sectionRevisions.createdAt)).limit(10),
  ]);
  const ids = [...new Set(revs.map((r) => r.changedBy).filter((v) => v && v !== "system"))];
  const people = ids.length ? await db.select({ id: userTable.id, email: userTable.email, name: userTable.name }).from(userTable).where(inArray(userTable.id, ids)) : [];
  const who = Object.fromEntries(people.map((p) => [p.id, p.name || p.email]));

  return (
    <div className="space-y-6">
      <Link href="/admin/library?tab=acts" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Law library · Acts
      </Link>
      <PageHeader
        eyebrow={<span className="font-mono">{act.id}</span>}
        icon={BookOpenText}
        title={act.title}
        description={
          <span className="tabular">
            {rows.length} sections{act.inForceFrom ? ` · in force from ${formatActDate(act.inForceFrom)}` : ""}
            {act.repealedOn ? ` · repealed ${formatActDate(act.repealedOn)}` : ""}
          </span>
        }
        actions={
          <ActDialog
            mode="edit"
            initial={{
              id: act.id,
              title: act.title,
              shortTitle: act.shortTitle,
              actNo: act.actNo,
              year: act.year,
              inForceFrom: act.inForceFrom,
              sourceUrl: act.sourceUrl,
              sourceNote: act.sourceNote,
            }}
          />
        }
      />

      <Card>
        <dl className="grid divide-y divide-border text-sm sm:grid-cols-2 sm:divide-y-0">
          {[
            ["Short title", act.shortTitle],
            ["Act number", act.actNo ?? "—"],
            ["Year", String(act.year)],
            ["Last changed", act.updatedAt ? formatDate(act.updatedAt) : "Not changed since seeding"],
            ["Last India Code sync", act.lastSyncedAt ? `${formatDate(act.lastSyncedAt)}${act.sourceVersion ? ` (${act.sourceVersion})` : ""}` : "Never"],
          ].map(([k, v]) => (
            <div key={k} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 sm:border-b sm:border-border">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right text-ink tabular">{v}</dd>
            </div>
          ))}
          <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-1 sm:border-b sm:border-border">
            <dt className="text-muted">Track India Code</dt>
            <dd>
              <TrackedSwitch actId={act.id} title={act.shortTitle} tracked={act.tracked} />
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 text-sm sm:border-t-0">
          <a href={act.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary hover:underline sm:min-h-0">
            Official source <ExternalLink className="size-3.5" aria-hidden />
          </a>
          {act.sourceNote ? <span className="text-muted">· {act.sourceNote}</span> : null}
        </div>
      </Card>

      <SectionManager actId={act.id} rows={rows.map((r) => ({ sectionNo: r.sectionNo, heading: r.heading, chapter: r.chapter }))} />

      {/* Fingerprints, not full text: the preview compares with the same plan the server applies. */}
      <ActPaste actId={act.id} current={rows.map((r) => ({ sectionNo: r.sectionNo, chapter: r.chapter, fingerprint: sectionFingerprint(r.heading, r.text) }))} />

      <section aria-labelledby="act-history">
        <SectionHeader
          title={<span id="act-history">Recent changes</span>}
          action={
            <Link href="/admin/library?tab=history" className="hover:underline">
              All history
            </Link>
          }
        />
        {revs.length ? (
          <RevisionList
            showAct={false}
            items={revs.map((r) => ({
              id: r.id,
              actId: r.actId,
              sectionNo: r.sectionNo,
              beforeHeading: r.beforeHeading,
              beforeText: r.beforeText,
              afterHeading: r.afterHeading,
              afterText: r.afterText,
              source: r.source,
              sourceRef: r.sourceRef,
              who: r.changedBy === "system" ? "Sync job" : (who[r.changedBy] ?? r.changedBy),
              note: r.note,
              createdAt: r.createdAt,
            }))}
          />
        ) : (
          <Card className="p-4 text-sm text-muted">
            No changes yet. <Badge tone="neutral">Seeded text</Badge>
          </Card>
        )}
      </section>
    </div>
  );
}
