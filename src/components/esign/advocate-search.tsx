"use client";

import { useEffect, useId, useState } from "react";
import { BadgeCheck, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/form";
import { searchAdvocatesAction, type AdvocateHit } from "@/app/app/sign/actions";

/** Search verified advocates (listed in the directory, or yourself) to link as the Lawyer. */
export function AdvocateSearch({ onPick, onCancel }: { onPick: (a: AdvocateHit) => void; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<AdvocateHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await searchAdvocatesAction(term);
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setHits([]);
      } else {
        setError(null);
        setHits(res.data);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const short = q.trim().length < 2;

  return (
    <div className="rounded-lg border border-border bg-surface-2/60 p-3" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        Find a verified advocate
      </label>
      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          id={id}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or enrolment number"
          className="pl-9"
          autoFocus
          autoComplete="off"
        />
        {loading && !short ? <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden /> : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {short ? "" : loading ? "Searching" : `${hits.length} advocates found`}
      </p>
      {error ? (
        <p className="mt-2 text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {!short && !loading && hits.length === 0 && !error ? (
        <p className="mt-2 text-[13px] text-muted">No verified advocate matches. You can still enter the lawyer’s name and email by hand.</p>
      ) : null}
      {!short && hits.length > 0 ? (
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
          {hits.map((h) => (
            <li key={h.userId}>
              <button
                type="button"
                onClick={() => onPick(h)}
                className="flex min-h-11 w-full cursor-pointer items-start gap-2 px-3 py-2 text-left hover:bg-surface-2"
              >
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{h.displayName}</span>
                  <span className="block truncate text-xs text-muted">
                    {h.enrolmentNo} · {h.stateBarCouncil}
                    {h.city ? ` · ${h.city}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={onCancel} className="h-10 cursor-pointer rounded-md px-3 text-sm text-muted hover:bg-surface hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
