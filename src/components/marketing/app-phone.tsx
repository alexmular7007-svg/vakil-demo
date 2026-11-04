import { BookOpenText, CalendarDays, FilePen, House, LayoutGrid, Signature, Sparkles } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/brand";

/**
 * Static phone illustration of the workspace home screen for marketing pages.
 * Decorative (aria-hidden): the sample entries are illustrative, not user data.
 */
export function AppPhone({ className = "" }: { className?: string }) {
  const tiles = [
    { icon: Sparkles, label: "Ask AI", cls: "bg-linear-to-br from-brand-2 to-brand text-gold-bright" },
    { icon: BookOpenText, label: "Bare acts", cls: "bg-(--tile-navy) text-(--tile-navy-fg)" },
    { icon: FilePen, label: "Draft", cls: "bg-(--tile-teal) text-(--tile-teal-fg)" },
    { icon: Signature, label: "E-sign", cls: "bg-(--tile-maroon) text-(--tile-maroon-fg)" },
  ];
  const rows = [
    { time: "10:30", item: "Item 14", title: "Recovery suit · Commercial Ct.", chip: "Arguments", tone: "bg-info-soft text-info" },
    { time: "11:45", item: "Item 32", title: "Bail application · Sessions", chip: "Orders", tone: "bg-warning-soft text-warning" },
    { time: "14:00", item: "Item 7", title: "s.138 complaint · JMFC", chip: "Evidence", tone: "bg-success-soft text-success" },
  ];
  return (
    <div aria-hidden className={`relative w-[290px] rounded-[44px] bg-[#0a0f1d] p-2.5 shadow-lg ring-1 ring-white/10 ${className}`}>
      <div className="absolute top-3.5 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-[#0a0f1d]" />
      <div className="overflow-hidden rounded-[36px] bg-bg">
        <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[10px] font-semibold text-ink">
          <span>9:41</span>
          <span className="tracking-widest">● ● ●</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2">
          <LogoMark className="size-7" />
          <Wordmark className="scale-90 origin-left" />
        </div>
        <div className="px-3">
          <div className="brand-surface rounded-[22px] p-4 shadow-brand">
            <p className="text-[10px] text-on-brand-muted">Good morning,</p>
            <p className="font-serif text-lg leading-tight font-semibold">Adv. Mehra</p>
            <p className="mt-3 text-[9px] font-bold tracking-[0.14em] text-gold-bright uppercase">Today&apos;s board</p>
            <p className="tabular font-serif text-[30px] leading-none font-semibold">3</p>
            <p className="text-[10px] text-on-brand-muted">matters listed · next at 10:30, Court 12</p>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1">
            {tiles.map((t) => (
              <div key={t.label} className="flex flex-col items-center gap-1">
                <span className={`inline-flex size-10 items-center justify-center rounded-[12px] ${t.cls}`}>
                  <t.icon className="size-[18px]" />
                </span>
                <span className="text-[9px] font-semibold text-ink-2">{t.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 mb-1.5 px-1 text-[11px] font-bold text-ink">Today in court</p>
          <div className="divide-y divide-border rounded-[16px] border border-border bg-surface">
            {rows.map((r) => (
              <div key={r.item} className="flex items-center gap-2 px-3 py-2">
                <span className="tabular w-9 text-[10px] leading-tight font-bold text-ink">
                  {r.time}
                  <span className="block font-medium text-muted">{r.item}</span>
                </span>
                <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold text-ink">{r.title}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[8.5px] font-bold ${r.tone}`}>{r.chip}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-5 border-t border-border bg-surface px-1 pt-1 pb-3">
          {[House, CalendarDays, null, FilePen, LayoutGrid].map((Icon, i) =>
            Icon ? (
              <span key={i} className={`flex h-10 items-center justify-center ${i === 0 ? "text-primary" : "text-muted"}`}>
                <Icon className="size-[18px]" />
              </span>
            ) : (
              <span key={i} className="flex justify-center">
                <span className="-mt-5 inline-flex size-11 items-center justify-center rounded-full bg-linear-to-br from-brand-2 to-brand text-gold-bright ring-4 ring-surface">
                  <Sparkles className="size-5" />
                </span>
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
