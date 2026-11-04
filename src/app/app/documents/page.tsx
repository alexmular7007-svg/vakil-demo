import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FileSearch } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { documents, matters } from "@/lib/db/schema";
import { fileKind } from "@/lib/documents/queries";
import { listMatterOptions } from "@/lib/drafting/queries";
import { features } from "@/lib/env";
import { maxUploadBytes } from "@/lib/files/validate";
import { istDate as formatDate } from "@/lib/drafting/format";
import { formatBytes } from "@/lib/utils";
import { Alert, Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { UploadDropzone } from "@/components/documents/upload-dropzone";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const user = await requireUser("/app/documents");
  const { rows, matterOptions } = await withUser(user.id, async (tx) => ({
    rows: await tx
      .select({
        id: documents.id,
        name: documents.name,
        mime: documents.mime,
        size: documents.size,
        pageCount: documents.pageCount,
        status: documents.status,
        error: documents.error,
        createdAt: documents.createdAt,
        matterTitle: matters.title,
      })
      .from(documents)
      .leftJoin(matters, eq(documents.matterId, matters.id))
      .orderBy(desc(documents.createdAt))
      .limit(200),
    matterOptions: await listMatterOptions(tx),
  }));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Drafting & signing" icon={FileSearch}
        title="Documents"
        description="Upload contracts, notices and pleadings to read the text, summarise, flag risky clauses, ask questions and compare versions."
      />

      {!features.ai ? (
        <Alert tone="warning" title="AI review is not switched on">
          You can still upload documents, read the extracted text and compare two documents line by line. Summaries, risk review and questions
          need an Anthropic or Google AI key on the server.
        </Alert>
      ) : null}

      <UploadDropzone maxBytes={maxUploadBytes()} matters={matterOptions.map((m) => ({ id: m.id, title: m.title }))} />

      <section aria-labelledby="docs-heading" className="space-y-3">
        <h2 id="docs-heading" className="font-serif text-lg font-semibold text-ink">
          Your documents
        </h2>
        {rows.length === 0 ? (
          <EmptyState icon={FileSearch} title="No documents yet" description="Upload a PDF, Word or text file above to get started." />
        ) : (
          <>
            <ul className="grid gap-2 md:hidden">
              {rows.map((d) => (
                <li key={d.id}>
                  <Link href={`/app/documents/${d.id}`} className="block rounded-lg border border-border bg-surface p-4 shadow-sm hover:border-border-strong">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-medium break-words text-ink">{d.name}</span>
                      <StatusBadge status={d.status} />
                    </div>
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                      <span>{fileKind(d.mime)}</span>
                      <span>{formatBytes(d.size)}</span>
                      {d.pageCount ? <span>{d.pageCount} pages</span> : null}
                      <span>{formatDate(d.createdAt)}</span>
                    </p>
                    {d.status === "failed" && d.error ? <p className="mt-2 text-xs text-warning">{d.error}</p> : null}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Type</Th>
                    <Th className="text-right">Size</Th>
                    <Th className="hidden text-right lg:table-cell">Pages</Th>
                    <Th className="hidden lg:table-cell">Matter</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Uploaded</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id} className="hover:bg-surface-2/60">
                      <Td className="max-w-[24rem]">
                        <Link href={`/app/documents/${d.id}`} className="font-medium break-words text-ink hover:text-primary hover:underline">
                          {d.name}
                        </Link>
                        {d.status === "failed" && d.error ? <span className="block text-xs text-warning">{d.error}</span> : null}
                      </Td>
                      <Td>{fileKind(d.mime)}</Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">{formatBytes(d.size)}</Td>
                      <Td className="hidden text-right tabular-nums lg:table-cell">{d.pageCount ?? "—"}</Td>
                      <Td className="hidden max-w-[12rem] truncate lg:table-cell">{d.matterTitle ?? <span className="text-muted">—</span>}</Td>
                      <Td>
                        <StatusBadge status={d.status} />
                      </Td>
                      <Td className="text-right whitespace-nowrap">{formatDate(d.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ready") return <Badge tone="success">Ready</Badge>;
  if (status === "failed") return <Badge tone="warning">No text</Badge>;
  return <Badge tone="info">Processing</Badge>;
}
