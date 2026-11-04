"use client";

import Link from "next/link";
import { useTransition } from "react";
import {
  Briefcase,
  CalendarCheck,
  CalendarPlus,
  ChevronRight,
  Copy,
  Download,
  Landmark,
  Loader2,
  MessageCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, IconTile, type TileTone } from "@/components/ui/display";
import { Dialog } from "@/components/ui/overlay";
import { deleteHearing } from "@/app/app/diary/actions";
import { formatDayDate, formatTime, formatYmd, relativeDay } from "@/lib/diary/dates";
import { hearingStatusChip } from "@/lib/diary/format";
import { ecourtsUrl, googleCalendarUrl, whatsappUrl } from "@/lib/diary/links";
import type { HearingItem } from "@/lib/diary/types";
import { cn } from "@/lib/utils";
import { copyCnrForEcourts } from "./ecourts";
import { OutcomeForm } from "./outcome-form";
import { useConfirm } from "@/components/ui/confirm";

export type DetailMode = "view" | "outcome";

export function HearingDetailDialog({
  state,
  today,
  onClose,
  onMode,
  onEdit,
  afterSave,
}: {
  state: { hearing: HearingItem; mode: DetailMode } | null;
  today: string;
  onClose: () => void;
  onMode: (m: DetailMode) => void;
  onEdit: (h: HearingItem) => void;
  afterSave: (date?: string | null) => void;
}) {
  const h = state?.hearing;
  const outcome = state?.mode === "outcome";
  const rel = h ? relativeDay(h.hearingDate, today) : null;
  return (
    <Dialog
      open={Boolean(state)}
      onClose={onClose}
      className="w-[min(100%-2rem,36rem)]"
      title={outcome ? "Record outcome" : <span data-private>{h?.caseTitle}</span>}
      description={
        h ? (
          outcome ? (
            <span data-private>{h.caseTitle}</span>
          ) : (
            <span className="tabular">
              {formatYmd(h.hearingDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {rel ? ` · ${rel}` : ""}
            </span>
          )
        ) : undefined
      }
    >
      {h && state ? (
        outcome ? (
          <OutcomeForm
            key={h.id}
            hearing={h}
            onBack={() => onMode("view")}
            onSaved={(nextDate) => {
              onClose();
              afterSave(nextDate);
            }}
          />
        ) : (
          <HearingDetail hearing={h} today={today} onOutcome={() => onMode("outcome")} onEdit={() => onEdit(h)} onClose={onClose} afterSave={afterSave} />
        )
      ) : null}
    </Dialog>
  );
}

function HearingDetail({
  hearing: h,
  today,
  onOutcome,
  onEdit,
  onClose,
  afterSave,
}: {
  hearing: HearingItem;
  today: string;
  onOutcome: () => void;
  onEdit: () => void;
  onClose: () => void;
  afterSave: (date?: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  const chip = hearingStatusChip(h, today);
  const time = formatTime(h.hearingTime);

  const remove = async () => {
    if (!(await confirm({ title: "Delete this hearing?", description: "It is removed from your diary. This cannot be undone.", tone: "danger" }))) return;
    start(async () => {
      const r = await deleteHearing(h.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Hearing deleted");
      onClose();
      afterSave();
    });
  };

  return (
    <div className="grid gap-5 pb-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={chip.tone} dot>
          {chip.label}
        </Badge>
        {h.purpose ? <Badge tone="neutral">{h.purpose}</Badge> : null}
        {time || h.itemNo ? (
          <span className="ml-auto text-sm font-semibold text-ink tabular">{[time, h.itemNo ? `Item ${h.itemNo}` : null].filter(Boolean).join(" · ")}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-4 gap-1">
        <ActionTile icon={CalendarCheck} tone="green" label={h.status === "scheduled" ? "Record outcome" : "Update outcome"} onClick={onOutcome} />
        <ActionTile icon={CalendarPlus} tone="gold" label="Google Calendar" href={googleCalendarUrl(h)} />
        <ActionTile icon={MessageCircle} tone="teal" label="Send on WhatsApp" href={whatsappUrl(h)} />
        {h.cnr ? (
          <ActionTile icon={Landmark} tone="navy" label="Open on eCourts" href={ecourtsUrl(h.cnr, h.court)} onClick={() => void copyCnrForEcourts(h.cnr!)} />
        ) : (
          <ActionTile icon={Pencil} tone="slate" label="Edit" onClick={onEdit} />
        )}
      </div>

      <dl className="divide-y divide-border rounded-[14px] border border-border">
        <Fact label="Court">{h.court}</Fact>
        <Fact label="Bench / hall">{h.bench}</Fact>
        <Fact label="Item no." tabular>
          {h.itemNo}
        </Fact>
        <Fact label="Case no." tabular>
          {h.caseNo}
        </Fact>
        {h.cnr ? (
          <div className="flex items-center gap-3 px-3.5 py-1.5">
            <dt className="w-24 shrink-0 text-[13px] text-muted">CNR</dt>
            <dd className="min-w-0 flex-1 truncate text-sm font-semibold text-ink tabular">{h.cnr}</dd>
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(h.cnr!).then(
                  () => toast.success("CNR copied"),
                  () => toast.error("Could not copy. Select the number instead."),
                )
              }
              className="-mr-1.5 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink sm:size-9"
              aria-label="Copy CNR"
            >
              <Copy className="size-4" />
            </button>
          </div>
        ) : null}
        <Fact label="Notes" multiline>
          {h.notes}
        </Fact>
        <Fact label="Outcome" multiline>
          {h.outcome}
        </Fact>
        {h.nextHearingId && h.nextHearingDate ? (
          <div className="flex items-center gap-3 px-3.5 py-1.5">
            <dt className="w-24 shrink-0 text-[13px] text-muted">Next date</dt>
            <dd className="min-w-0 flex-1">
              <Link
                href={`/app/diary?date=${h.nextHearingDate}&hearing=${h.nextHearingId}`}
                onClick={onClose}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary tabular hover:underline sm:min-h-9"
              >
                {formatDayDate(h.nextHearingDate)} <ChevronRight className="size-4" aria-hidden />
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>

      <ul className="-mx-2 grid">
        <ListAction icon={Download} href={`/api/diary/ics?hearing=${h.id}`} download>
          Download .ics for Apple or Outlook Calendar
        </ListAction>
        {h.matterId ? (
          <ListAction icon={Briefcase} href={`/app/matters/${h.matterId}`} onClick={onClose}>
            Open matter
          </ListAction>
        ) : null}
        {h.cnr ? (
          <ListAction icon={Pencil} onClick={onEdit}>
            Edit hearing
          </ListAction>
        ) : null}
        <ListAction icon={pending ? Loader2 : Trash2} onClick={remove} danger disabled={pending}>
          Delete hearing
        </ListAction>
      </ul>
    </div>
  );
}

function Fact({ label, children, tabular, multiline }: { label: string; children: React.ReactNode; tabular?: boolean; multiline?: boolean }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className={cn("flex gap-3 px-3.5 py-2.5", multiline ? "items-start" : "items-center")}>
      <dt className="w-24 shrink-0 text-[13px] text-muted">{label}</dt>
      <dd className={cn("min-w-0 flex-1 text-sm text-ink", tabular && "tabular", multiline ? "whitespace-pre-line" : "truncate")}>{children}</dd>
    </div>
  );
}

function ActionTile({
  icon,
  tone,
  label,
  href,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: TileTone;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const cls =
    "pressable flex min-h-[84px] cursor-pointer flex-col items-center gap-1.5 rounded-[14px] px-1 pt-1.5 pb-2 text-center text-[12px] leading-tight font-semibold text-ink-2 hover:bg-surface-2";
  const inner = (
    <>
      <IconTile icon={icon} tone={tone} size="md" />
      <span>{label}</span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function ListAction({
  icon: Icon,
  children,
  href,
  onClick,
  download,
  danger,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  download?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const cls = cn(
    "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[12px] px-2 text-left text-sm font-semibold hover:bg-surface-2 disabled:opacity-50",
    danger ? "text-danger" : "text-ink-2",
  );
  const inner = (
    <>
      <Icon className={cn("size-[18px] shrink-0", danger ? "" : "text-muted", disabled && "animate-spin")} />
      <span className="min-w-0 flex-1">{children}</span>
      {!danger ? <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden /> : null}
    </>
  );
  return (
    <li>
      {href ? (
        download ? (
          <a href={href} download className={cls}>
            {inner}
          </a>
        ) : (
          <Link href={href} onClick={onClick} className={cls}>
            {inner}
          </Link>
        )
      ) : (
        <button type="button" onClick={onClick} disabled={disabled} className={cls}>
          {inner}
        </button>
      )}
    </li>
  );
}
