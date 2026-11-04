import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  href,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-serif text-3xl font-semibold tabular-nums",
          tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </>
  );
  const cls = "block rounded-lg border border-border bg-surface p-4 shadow-sm";
  return href ? (
    <Link href={href} className={cn(cls, "transition-shadow hover:shadow-md")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
