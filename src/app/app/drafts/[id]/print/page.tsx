import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { findPlaceholders } from "@/lib/drafting/fill";
import { loadDraftBundle } from "@/lib/drafting/queries";
import { istDateTime as formatDateTime } from "@/lib/drafting/format";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { DraftDocument } from "@/components/drafting/draft-document";
import { PrintButton } from "@/components/drafting/print-button";

export const metadata: Metadata = { title: "Print draft" };

// Print styles: hide the app shell, print the sheet on white A4 with court-style margins.
// The browser shapes Devanagari itself, so "Save as PDF" keeps Hindi text correct.
const printCss = `
@page { size: A4; margin: 2.2cm 2cm 2.2cm 2.5cm; }
.draft-sheet { box-shadow: var(--shadow-md); }
@media print {
  aside, header, nav, .no-print, [data-sonner-toaster] { display: none !important; }
  html, body { background: #fff !important; }
  div:has(> #main) { padding: 0 !important; }
  #main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
  .draft-sheet { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important;
    margin: 0 !important; max-width: none !important; width: auto !important; background: #fff !important; }
  .draft-sheet, .draft-sheet * { color: #000 !important; }
  .draft-sheet .draft-placeholder { background: #fff3c4 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .draft-pagebreak { break-after: page; height: 0; margin: 0; overflow: hidden; border: 0; }
  .draft-pagebreak * { display: none !important; }
  .draft-document p { orphans: 3; widows: 3; }
}
`;

export default async function PrintDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/app/drafts/${id}/print`);
  const bundle = await loadDraftBundle(user.id, id);
  if (!bundle) notFound();
  const { draft } = bundle;
  const remaining = findPlaceholders(draft.body);

  return (
    <div>
      <style>{printCss}</style>
      <div className="no-print mb-5 space-y-4">
        <Link href={`/app/drafts/${draft.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Back to editor
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate font-serif text-xl font-semibold text-ink" lang={draft.language === "hi" ? "hi" : undefined}>
              {draft.title}
            </h1>
            <p className="text-sm text-muted">
              Version {draft.version} · saved {formatDateTime(draft.updatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/drafts/${draft.id}/docx`} className={buttonVariants({ variant: "outline" })}>
              Download .docx
            </a>
            <PrintButton />
          </div>
        </div>
        <p className="text-sm text-muted">
          In the print dialog choose <strong className="text-ink">Save as PDF</strong> as the destination, A4 paper, and turn off headers and
          footers for a clean page.
        </p>
        {remaining.length > 0 ? (
          <Alert tone="warning" title={`${remaining.length} placeholder${remaining.length === 1 ? " is" : "s are"} still unfilled`}>
            They are highlighted below and will print as highlighted text. Fill them in the editor first.
          </Alert>
        ) : null}
      </div>

      <article className="draft-sheet mx-auto max-w-[210mm] rounded-md border border-border bg-surface px-6 py-8 sm:px-[2cm] sm:py-[2.2cm]">
        <DraftDocument body={draft.body} language={draft.language} variant="print" />
      </article>
    </div>
  );
}
