import { Info } from "lucide-react";

export function CompanySourceNote() {
  return (
    <p className="flex gap-2 text-xs text-muted">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Read-only data from the search.vaakil.com directory, compiled from Registrar of Companies records. It may be out of
        date: confirm on the MCA portal before relying on it. Director entries that could not be verified (placeholder rows
        the old directory generated) are hidden.
      </span>
    </p>
  );
}
