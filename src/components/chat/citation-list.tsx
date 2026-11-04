import Link from "next/link";
import { AlertTriangle, BadgeCheck, BookOpenText, FileText, Gavel, HelpCircle, XCircle } from "lucide-react";
import type { ChatCitation } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

const statusMeta: Record<ChatCitation["status"], { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }> = {
  verified: { label: "Retrieved source", tone: "text-success bg-success-soft", icon: BadgeCheck },
  in_corpus: { label: "Found in corpus", tone: "text-success bg-success-soft", icon: BadgeCheck },
  not_in_corpus: { label: "Not in corpus: verify", tone: "text-warning bg-warning-soft", icon: HelpCircle },
  in_library: { label: "Verified in library", tone: "text-success bg-success-soft", icon: BadgeCheck },
  unverified: { label: "Case not verified", tone: "text-warning bg-warning-soft", icon: AlertTriangle },
  invalid: { label: "Invalid citation", tone: "text-danger bg-danger-soft", icon: XCircle },
};

const kindIcon = { statute: BookOpenText, document: FileText, judgment: Gavel, case: Gavel };

export function CitationList({ citations, messageId }: { citations: ChatCitation[]; messageId: string }) {
  if (citations.length === 0) return null;
  const needsCheck = citations.filter((c) => c.status === "unverified" || c.status === "not_in_corpus" || c.status === "invalid");
  return (
    <div className="mt-3 space-y-2">
      {needsCheck.length > 0 ? (
        <p className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-ink-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          {needsCheck.length === 1 ? "One reference" : `${needsCheck.length} references`} could not be checked against the Vaakil
          corpus. Verify {needsCheck.length === 1 ? "it" : "them"} in an authoritative source before relying on the answer.
        </p>
      ) : null}
      <ol className="grid gap-1.5">
        {citations.map((c) => {
          const s = statusMeta[c.status];
          const Kind = kindIcon[c.kind];
          const body = (
            <>
              <Kind className="mt-0.5 size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-ink">{c.id.startsWith("S") ? `[${c.id}] ` : ""}</span>
                <span className="text-ink-2">{c.label}</span>
              </span>
              <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", s.tone)}>
                <s.icon className="size-3" />
                <span className="max-sm:hidden">{s.label}</span>
              </span>
            </>
          );
          return (
            <li key={c.id} id={`cite-${messageId}-${c.id}`} className="scroll-mt-24">
              {c.href ? (
                <Link href={c.href} className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[13px] hover:border-primary/40">
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[13px]">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
