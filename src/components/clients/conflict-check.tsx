"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { ChevronRight, Loader2, ScanSearch } from "lucide-react";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, IconTile } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { checkConflicts } from "@/app/app/clients/actions";

type Hit = {
  key: string;
  role: "client" | "opposing" | "matter_client" | "title";
  name: string;
  context: string;
  href: string;
  closed?: boolean;
};

const roleMeta: Record<Hit["role"], { label: string; tone: "info" | "danger" | "warning" | "neutral" }> = {
  client: { label: "Your client", tone: "info" },
  opposing: { label: "Opposing party", tone: "danger" },
  matter_client: { label: "Client in a matter", tone: "warning" },
  title: { label: "In a matter title", tone: "neutral" },
};

/** "Check a name for conflicts": searches client names and each matter's parties and title. */
export function ConflictCheck() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ query: string; hits: Hit[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputId = useId();

  const run = () =>
    start(async () => {
      const r = await checkConflicts(q);
      if (!r.ok) {
        setError(r.error);
        setResult(null);
        return;
      }
      setError(null);
      setResult(r.data);
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconTile icon={ScanSearch} tone="maroon" size="sm" />
          <div>
            <CardTitle>Check a name for conflicts</CardTitle>
            <CardDescription>Before taking a brief, see whether a person or company is already your client or an opposing party.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <label htmlFor={inputId} className="sr-only">
            Name to check
          </label>
          <Input
            id={inputId}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Mehta Builders"
            minLength={2}
            maxLength={120}
            autoComplete="off"
            className="sm:flex-1"
          />
          <Button type="submit" variant="secondary" disabled={pending || q.trim().length < 2}>
            {pending ? <Loader2 className="animate-spin" /> : <ScanSearch />} Check
          </Button>
        </form>

        {error ? <p className="text-[13px] text-danger" role="alert">{error}</p> : null}

        <div aria-live="polite">
          {result ? (
            result.hits.length === 0 ? (
              <Alert tone="success" title={`No record of “${result.query}”`}>
                The name does not appear among your clients, or as a client, opposing party or title in your matters.
              </Alert>
            ) : (
              <div className="space-y-3">
                <Alert tone="warning" title={`“${result.query}” appears ${result.hits.length} ${result.hits.length === 1 ? "time" : "times"}`}>
                  Review each one before accepting the brief.
                </Alert>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {result.hits.map((h) => (
                    <li key={h.key}>
                      <Link href={h.href} className="group flex min-h-14 items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2/60">
                        <div className="min-w-0 flex-1">
                          <p data-private className="truncate text-sm font-semibold text-ink group-hover:text-primary">
                            {h.name}
                          </p>
                          <p data-private className="truncate text-[13px] text-muted">
                            {h.context}
                            {h.closed ? " (closed)" : ""}
                          </p>
                        </div>
                        <Badge tone={roleMeta[h.role].tone} dot>
                          {roleMeta[h.role].label}
                        </Badge>
                        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          ) : null}
        </div>
        <p className="text-xs text-muted">
          Searches only what you have recorded here, by partial name. Check spelling variants, group companies and family members yourself.
        </p>
      </CardContent>
    </Card>
  );
}
