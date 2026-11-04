import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/display";
import { EnvelopeForm } from "@/components/esign/envelope-form";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { drafts } from "@/lib/db/schema";
import { env, features } from "@/lib/env";
import { hasUnsupportedChars } from "@/lib/esign/pdf";
import { AadhaarAggregatorProvider } from "@/lib/esign/provider";

export const metadata: Metadata = { title: "New envelope" };

export default async function NewEnvelopePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/app/sign/new");
  const raw = (await searchParams).draft;
  const draftId = z.uuid().safeParse(typeof raw === "string" ? raw : "");
  let draft: { id: string; title: string; unsupported: boolean } | null = null;
  let draftMissing = false;
  if (raw) {
    if (!draftId.success) {
      draftMissing = true;
    } else {
      const [row] = await withUser(user.id, (tx) =>
        tx.select({ id: drafts.id, title: drafts.title, body: drafts.body }).from(drafts).where(eq(drafts.id, draftId.data)).limit(1),
      );
      if (!row) draftMissing = true;
      else draft = { id: row.id, title: row.title, unsupported: hasUnsupportedChars(row.title) || hasUnsupportedChars(row.body) };
    }
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3 h-10">
        <Link href="/app/sign">
          <ArrowLeft aria-hidden /> E-Sign
        </Link>
      </Button>
      <PageHeader
        title="New envelope"
        description="Add the document and the people who review, sign, witness or receive a copy. It is saved as a draft for you to check before anything is sent."
      />
      <EnvelopeForm
        draft={draft}
        draftMissing={draftMissing}
        aadhaarAvailable={features.aadhaarEsign}
        aadhaarLabel={features.aadhaarEsign ? new AadhaarAggregatorProvider().label : "Aadhaar eSign"}
        maxUploadMb={env.MAX_UPLOAD_MB}
      />
    </div>
  );
}
