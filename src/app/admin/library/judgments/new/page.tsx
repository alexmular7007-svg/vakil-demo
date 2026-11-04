import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Gavel } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/guard";
import { maxUploadBytes } from "@/lib/files/validate";
import { libraryCourts } from "@/lib/judgments/queries";
import { PageHeader } from "@/components/ui/display";
import { JudgmentForm } from "@/components/library/judgment-form";

export const metadata: Metadata = { title: "Add judgment" };

// The constitutional courts, for the court field's suggestions.
const COURTS = [
  "Supreme Court of India",
  "Allahabad High Court",
  "Andhra Pradesh High Court",
  "Bombay High Court",
  "Calcutta High Court",
  "Chhattisgarh High Court",
  "Delhi High Court",
  "Gauhati High Court",
  "Gujarat High Court",
  "Himachal Pradesh High Court",
  "Jammu & Kashmir and Ladakh High Court",
  "Jharkhand High Court",
  "Karnataka High Court",
  "Kerala High Court",
  "Madhya Pradesh High Court",
  "Madras High Court",
  "Manipur High Court",
  "Meghalaya High Court",
  "Orissa High Court",
  "Patna High Court",
  "Punjab and Haryana High Court",
  "Rajasthan High Court",
  "Sikkim High Court",
  "Telangana High Court",
  "Tripura High Court",
  "Uttarakhand High Court",
];

export default async function NewJudgmentPage() {
  await requireAdminPage();
  const inLibrary = await libraryCourts().catch(() => []);
  const courts = [...new Set([...COURTS, ...inLibrary.map((c) => c.court)])];
  return (
    <div className="space-y-5">
      <Link href="/admin/library?tab=judgments" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Law library · Judgments
      </Link>
      <PageHeader
        eyebrow="Law library"
        icon={Gavel}
        title="Add a judgment"
        description="Upload the court's copy or paste its text. It is split into numbered paragraphs so AI answers can quote the exact paragraph."
      />
      <JudgmentForm courts={courts} maxBytes={maxUploadBytes()} />
    </div>
  );
}
