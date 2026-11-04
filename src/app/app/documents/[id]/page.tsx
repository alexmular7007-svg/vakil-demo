import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { DISPLAY_CHARS, fileKind, loadDocumentView } from "@/lib/documents/queries";
import { features } from "@/lib/env";
import { istDateTime as formatDateTime } from "@/lib/drafting/format";
import { formatBytes } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/display";
import { DeleteDocumentButton } from "@/components/documents/delete-document-button";
import { DocumentWorkbench } from "@/components/documents/document-workbench";

export const metadata: Metadata = { title: "Document" };

// AI review runs as server actions on this page and can take a while on long documents.
export const maxDuration = 120;

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/app/documents/${id}`);
  const view = await loadDocumentView(user.id, id);
  if (!view) notFound();
  const { doc, others } = view;
  const text = doc.textContent ?? "";

  return (
    <div className="space-y-5">
      <Link href="/app/documents" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Documents
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold tracking-tight break-words text-ink sm:text-[28px]">{doc.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone="outline">{fileKind(doc.mime)}</Badge>
            <span>{formatBytes(doc.size)}</span>
            {doc.pageCount ? <span>· {doc.pageCount} pages</span> : null}
            <span>· uploaded {formatDateTime(doc.createdAt)}</span>
            {doc.matterTitle ? <span>· matter: {doc.matterTitle}</span> : null}
          </div>
          <p className="mt-1 text-xs break-all text-muted">
            SHA-256 <span className="font-mono">{doc.sha256}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a href={`/api/documents/${doc.id}/file`} className={buttonVariants({ variant: "outline" })}>
            <Download /> Original file
          </a>
          <DeleteDocumentButton id={doc.id} name={doc.name} />
        </div>
      </div>

      {doc.status === "ready" && text ? (
        <DocumentWorkbench
          doc={{ id: doc.id, name: doc.name }}
          text={text.slice(0, DISPLAY_CHARS)}
          textTruncated={text.length > DISPLAY_CHARS}
          totalChars={text.length}
          others={others}
          aiEnabled={features.ai}
        />
      ) : doc.status === "failed" ? (
        <Alert tone="warning" title="No text could be read from this file">
          {doc.error ?? "The file could not be read."} You can download the original or delete it.
        </Alert>
      ) : (
        <Alert tone="info" title="Still processing">
          The text of this document is being extracted. Refresh the page in a moment.
        </Alert>
      )}
    </div>
  );
}
