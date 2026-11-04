import type { Metadata } from "next";
import Link from "next/link";
import { Calculator, ChevronRight, Landmark } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { IconTile, PageHeader } from "@/components/ui/display";
import { appToolHref, CALCULATORS } from "@/components/calculators/catalog";

export const metadata: Metadata = { title: "Calculators" };

export default async function ToolsPage() {
  await requireUser("/app/tools");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Practice"
        icon={Calculator}
        title="Calculators"
        description="Deadlines and figures you would otherwise work out by hand, with every step shown and the section it comes from."
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        {CALCULATORS.map((c) => (
          <li key={c.slug}>
            <Link
              href={appToolHref(c.slug)}
              className="group flex min-h-[88px] items-center gap-4 rounded-lg border border-border/80 bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5"
            >
              <IconTile icon={c.icon} tone={c.tone} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{c.title}</span>
                <span className="mt-0.5 block text-sm text-muted">{c.body}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
        <Landmark className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          Rules come from the statute text on India Code and, for cheque validity, the RBI. The calculators run in your browser and save nothing. They are
          an aid: verify the result before filing.
        </span>
      </p>
    </div>
  );
}
