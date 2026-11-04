"use client";

import Link from "next/link";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { Building2, ChevronRight, Contact, Search } from "lucide-react";
import { Badge, Card, IconTile } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { formatINR } from "@/lib/utils";

export type DirectoryRow = {
  id: string;
  name: string;
  kind: string;
  phone: string | null;
  email: string | null;
  matterCount: number;
  outstandingPaise: number;
  overdue: boolean;
};

/** Searchable client register. Filtering happens in the browser so names never go into a URL. */
export function ClientDirectory({ rows }: { rows: DirectoryRow[] }) {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const inputId = useId();
  const shown = useMemo(() => {
    if (!query) return rows;
    const digits = query.replace(/\D/g, "");
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        (r.email?.toLowerCase().includes(query) ?? false) ||
        (digits.length >= 3 && (r.phone?.includes(digits) ?? false)),
    );
  }, [rows, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <label htmlFor={inputId} className="sr-only">
          Search clients
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          id={inputId}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, phone or email"
          className="pl-10"
          autoComplete="off"
        />
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted">No client matches “{q.trim()}”.</p>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {shown.map((r) => (
              <li key={r.id}>
                <Link href={`/app/clients/${r.id}`} className="group flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:px-5">
                  <IconTile icon={r.kind === "business" ? Building2 : Contact} tone={r.kind === "business" ? "navy" : "teal"} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p data-private className="truncate font-semibold text-ink group-hover:text-primary">
                      {r.name}
                    </p>
                    <p className="truncate text-[13px] text-muted">
                      <span className="tabular">
                        {r.matterCount} {r.matterCount === 1 ? "matter" : "matters"}
                      </span>
                      {r.phone || r.email ? (
                        <>
                          {" · "}
                          <span data-private className="tabular">
                            {[r.phone, r.email].filter(Boolean).join(" · ")}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  {r.outstandingPaise > 0 ? (
                    <Badge tone={r.overdue ? "danger" : "warning"} dot className="tabular">
                      {formatINR(r.outstandingPaise)} {r.overdue ? "overdue" : "due"}
                    </Badge>
                  ) : null}
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-muted tabular">
        {shown.length === rows.length ? `${rows.length} ${rows.length === 1 ? "client" : "clients"}` : `${shown.length} of ${rows.length} clients`}
      </p>
    </div>
  );
}
