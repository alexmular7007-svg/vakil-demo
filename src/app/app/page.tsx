import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import {
  ArrowLeftRight,
  ArrowRight,
  BookOpenText,
  Calculator,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  FilePen,
  FileSearch,
  Lock,
  MessageSquareText,
  Newspaper,
  ReceiptIndianRupee,
  ShieldCheck,
  Signature,
  Sparkles,
} from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { chats, consents, documents, drafts, envelopes } from "@/lib/db/schema";
import { features } from "@/lib/env";
import { Alert, Badge, Card, EmptyState, IconTile, ListRow, SectionHeader, type TileTone } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { ConsentGate } from "@/components/app/consent-gate";
import { PrivacyToggle } from "@/components/app/privacy-toggle";
import { getDiaryBoard, type HearingItem } from "@/lib/diary/queries";
import { formatTime, formatYmd, relativeDay, todayIST } from "@/lib/diary/dates";
import { hearingLocation, hearingStatusChip, taskDueChip } from "@/lib/diary/format";
import { getFeeSummary } from "@/lib/fees/queries";
import { getUpdatesAccess, hasUpdatesAccess } from "@/lib/billing/entitlements";
import { latestUpdates } from "@/lib/updates/queries";
import { kindLabel } from "@/lib/updates/labels";
import { cn, formatDate, formatINR, formatINRCompact } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

const quickActions: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; tone: TileTone }[] = [
  { href: "/app/chat", label: "Ask AI", icon: Sparkles, tone: "brand" },
  { href: "/app/research", label: "Bare acts", icon: BookOpenText, tone: "navy" },
  { href: "/app/drafts/new", label: "New draft", icon: FilePen, tone: "teal" },
  { href: "/app/documents", label: "Review doc", icon: FileSearch, tone: "slate" },
  { href: "/app/sign/new", label: "E-sign", icon: Signature, tone: "maroon" },
  { href: "/app/diary?new=1", label: "Add hearing", icon: CalendarPlus, tone: "green" },
  { href: "/app/tools", label: "Calculators", icon: Calculator, tone: "gold" },
  { href: "/app/research?tab=convert", label: "IPC → BNS", icon: ArrowLeftRight, tone: "navy" },
];

const envelopeTone: Record<string, "success" | "warning" | "info" | "danger" | "neutral"> = {
  COMPLETED: "success",
  PARTIALLY_SIGNED: "warning",
  OUT_FOR_SIGNATURE: "info",
  DECLINED: "danger",
  EXPIRED: "danger",
  VOIDED: "neutral",
  DRAFT: "neutral",
};

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());
}

function ago(d: Date) {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days < 7 ? `${days} d ago` : formatDate(d);
}

type Activity = {
  id: string;
  title: string;
  kind: string;
  href: string;
  at: Date;
  icon: React.ComponentType<{ className?: string }>;
  tone: TileTone;
  chip?: { label: string; tone: "success" | "warning" | "info" | "danger" | "neutral" };
};

export default async function DashboardPage() {
  const user = await requireUser("/app");
  const [data, board, fees, updatesAccess, rawUpdates] = await Promise.all([
    withUser(user.id, async (tx) => {
      const [recentChats, recentDrafts, recentEnvelopes, recentDocs, consentRows, [pendingSign]] = await Promise.all([
        tx.select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt }).from(chats).orderBy(desc(chats.updatedAt)).limit(4),
        tx.select({ id: drafts.id, title: drafts.title, updatedAt: drafts.updatedAt, status: drafts.status }).from(drafts).orderBy(desc(drafts.updatedAt)).limit(4),
        tx.select({ id: envelopes.id, title: envelopes.title, status: envelopes.status, updatedAt: envelopes.updatedAt }).from(envelopes).orderBy(desc(envelopes.updatedAt)).limit(4),
        tx.select({ id: documents.id, name: documents.name, createdAt: documents.createdAt }).from(documents).orderBy(desc(documents.createdAt)).limit(4),
        tx.select({ id: consents.id }).from(consents).where(eq(consents.purpose, "service")).limit(1),
        tx
          .select({ n: count() })
          .from(envelopes)
          .where(and(eq(envelopes.ownerId, user.id), inArray(envelopes.status, ["OUT_FOR_SIGNATURE", "PARTIALLY_SIGNED"]))),
      ]);
      return {
        recentChats,
        recentDrafts,
        recentEnvelopes,
        recentDocs,
        hasConsent: consentRows.length > 0,
        pendingSign: pendingSign?.n ?? 0,
      };
    }),
    getDiaryBoard(user.id),
    getFeeSummary(user.id),
    getUpdatesAccess(user),
    latestUpdates(4),
  ]);

  if (!data.hasConsent) return <ConsentGate name={user.name} />;

  const updates = hasUpdatesAccess(updatesAccess) ? rawUpdates : [];
  const today = todayIST();
  const listed = board.today.filter((h) => h.status !== "cancelled");
  const nextUp = listed.find((h) => h.status === "scheduled") ?? board.upcoming[0] ?? null;
  const courtList = listed.length ? listed : board.upcoming;

  const activity: Activity[] = [
    ...data.recentChats.map((c) => ({ id: `c${c.id}`, title: c.title, kind: "Ask AI", href: `/app/chat/${c.id}`, at: c.updatedAt, icon: MessageSquareText, tone: "navy" as const })),
    ...data.recentDrafts.map((d) => ({
      id: `d${d.id}`,
      title: d.title,
      kind: "Draft",
      href: `/app/drafts/${d.id}`,
      at: d.updatedAt,
      icon: FilePen,
      tone: "teal" as const,
      chip: d.status === "final" ? { label: "Final", tone: "success" as const } : { label: "Draft", tone: "neutral" as const },
    })),
    ...data.recentEnvelopes.map((e) => ({
      id: `e${e.id}`,
      title: e.title,
      kind: "E-sign",
      href: `/app/sign/${e.id}`,
      at: e.updatedAt,
      icon: Signature,
      tone: "maroon" as const,
      chip: { label: e.status.replaceAll("_", " ").toLowerCase(), tone: envelopeTone[e.status] ?? "neutral" },
    })),
    ...data.recentDocs.map((d) => ({ id: `f${d.id}`, title: d.name, kind: "Document", href: `/app/documents/${d.id}`, at: d.createdAt, icon: FileSearch, tone: "slate" as const })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 7);

  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-7 lg:space-y-9">
      <div className="grid grid-cols-1 gap-7 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:items-stretch">
      {/* Hero: the "balance card" of a legal practice */}
      <section className="brand-surface relative overflow-hidden rounded-2xl p-5 shadow-brand sm:p-7" aria-label="Today">
        <div className="absolute inset-x-0 top-0 h-px gold-rule opacity-70" aria-hidden />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-on-brand-muted">{greeting()},</p>
            <h1 className="truncate font-serif text-[28px] leading-tight font-semibold sm:text-[34px]">{firstName}</h1>
            <p className="mt-1 text-xs font-semibold tracking-[0.12em] text-gold-bright uppercase">{todayLabel()}</p>
          </div>
          <PrivacyToggle />
        </div>

        <div className="mt-6">
          <p className="text-[11px] font-bold tracking-[0.16em] text-gold-bright uppercase">Today&apos;s board</p>
          <p className="mt-1 flex items-baseline gap-2.5">
            <span className="tabular font-serif text-[44px] leading-none font-semibold">{board.counts.today}</span>
            <span className="text-sm text-on-brand-muted">{board.counts.today === 1 ? "matter listed today" : "matters listed today"}</span>
          </p>
          <p className="mt-2 line-clamp-2 text-sm text-on-brand">
            {nextUp ? (
              <>
                <span className="text-on-brand-muted">{nextUp.hearingDate === today ? "Next:" : `Next, ${relativeDay(nextUp.hearingDate, today) ?? formatYmd(nextUp.hearingDate, { weekday: "short", day: "numeric", month: "short" })}:`}</span>{" "}
                <span data-private>{nextUp.caseTitle}</span>
                {[formatTime(nextUp.hearingTime), hearingLocation(nextUp), nextUp.itemNo ? `Item ${nextUp.itemNo}` : ""].filter(Boolean).length ? (
                  <span className="text-on-brand-muted"> · {[formatTime(nextUp.hearingTime), hearingLocation(nextUp), nextUp.itemNo ? `Item ${nextUp.itemNo}` : ""].filter(Boolean).join(" · ")}</span>
                ) : null}
              </>
            ) : (
              <span className="text-on-brand-muted">Nothing listed this week. Add hearings to build your board.</span>
            )}
          </p>
        </div>

        <div className="glass-on-brand mt-5 grid grid-cols-3 divide-x divide-white/10 rounded-lg">
          <HeroStat label="This week" value={String(board.counts.week)} href="/app/diary" />
          <HeroStat label="Awaiting signature" value={String(data.pendingSign)} href="/app/sign" />
          <HeroStat label="Fees due" value={formatINRCompact(fees.outstandingPaise)} href="/app/fees" small privateValue />
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button asChild variant="gold">
            <Link href="/app/diary">
              <CalendarDays /> Open case diary
            </Link>
          </Button>
          <Button asChild variant="ghost" className="glass-on-brand text-on-brand hover:bg-white/15 hover:text-on-brand">
            <Link href="/app/chat">
              <Sparkles /> Ask AI
            </Link>
          </Button>
        </div>
      </section>

      {/* Quick actions: a bare grid on phones, a card beside the hero on wide screens */}
      <section aria-label="Quick actions" className="xl:glass xl:rounded-lg xl:p-6">
        <h2 className="mb-4 hidden text-[15px] font-bold text-ink xl:block">Quick actions</h2>
        <div className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-8 xl:grid-cols-4 xl:gap-y-6">
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href} className="pressable group flex flex-col items-center gap-2 rounded-md py-1 text-center">
              <IconTile icon={a.icon} tone={a.tone} className="size-12 shadow-sm transition-shadow group-hover:shadow-md" />
              <span className="text-[11.5px] leading-tight font-semibold text-ink-2">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>
      </div>

      {!features.ai ? (
        <Alert tone="warning" title="AI answers are not switched on yet">
          Add an Anthropic or Google AI key to <code>.env.local</code> to enable Ask AI, AI drafting and document review. Research, templates, the diary, documents and
          e-sign work without it.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-7">
        <section>
          <SectionHeader title={listed.length ? "Today in court" : "Coming up"} action={<Link href="/app/diary">Open diary</Link>} />
          {courtList.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 px-6 py-8 text-center sm:flex-row sm:text-left">
              <IconTile icon={CalendarDays} tone="green" size="lg" />
              <div className="min-w-0 flex-1">
                <p className="font-serif text-lg font-semibold text-ink">No hearings in the next 7 days</p>
                <p className="text-sm text-muted">Add your next dates once; the board, reminders and client updates follow from them.</p>
              </div>
              <Button asChild>
                <Link href="/app/diary?new=1">
                  <CalendarPlus /> Add hearing
                </Link>
              </Button>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {courtList.map((h) => (
                  <HearingRow key={h.id} h={h} today={today} />
                ))}
              </ul>
            </Card>
          )}
        </section>

        {board.tasksDue.length ? (
          <section>
            <SectionHeader title="Tasks due" action={<Link href="/app/diary">All tasks</Link>} />
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {board.tasksDue.map((t) => {
                  const chip = taskDueChip(t.dueDate, t.done, today);
                  return (
                    <ListRow
                      key={t.id}
                      href="/app/diary"
                      icon={CheckCircle2}
                      tone="slate"
                      title={t.title}
                      subtitle={t.matterTitle ? <span data-private>{t.matterTitle}</span> : undefined}
                      trailing={
                        chip ? (
                          <Badge tone={chip.tone} dot>
                            {chip.label}
                          </Badge>
                        ) : null
                      }
                    />
                  );
                })}
              </ul>
            </Card>
          </section>
        ) : null}

        <section>
          <SectionHeader title="Recent activity" action={<Link href="/app/chat/history">See all</Link>} />
          {activity.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Your workspace is ready"
              description="Ask a legal question, start a draft or add today's hearings. Everything you do shows up here."
              action={
                <Button asChild>
                  <Link href="/app/chat">
                    <Sparkles /> Ask your first question
                  </Link>
                </Button>
              }
            />
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {activity.map((a) => (
                  <ListRow
                    key={a.id}
                    href={a.href}
                    icon={a.icon}
                    tone={a.tone}
                    title={a.title}
                    privateTitle
                    subtitle={`${a.kind} · ${ago(a.at)}`}
                    trailing={
                      a.chip ? (
                        <Badge tone={a.chip.tone} dot className="hidden capitalize sm:inline-flex">
                          {a.chip.label}
                        </Badge>
                      ) : null
                    }
                  />
                ))}
              </ul>
            </Card>
          )}
        </section>
        </div>

        <aside className="space-y-5">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <IconTile icon={Newspaper} tone="maroon" size="sm" />
                <p className="text-[15px] font-bold text-ink">Legal updates</p>
              </div>
              {updatesAccess.status === "trial" ? (
                <Badge tone="warning" dot>
                  Trial · {updatesAccess.daysLeft}d left
                </Badge>
              ) : updatesAccess.status === "expired" ? (
                <Badge tone="neutral" dot>
                  Subscription
                </Badge>
              ) : null}
            </div>
            {hasUpdatesAccess(updatesAccess) ? (
              updates.length ? (
                <ul className="divide-y divide-border">
                  {updates.map((u) => (
                    <li key={u.id}>
                      <a href={u.url} target="_blank" rel="noopener noreferrer" className="block px-5 py-3 hover:bg-surface-2/60">
                        <span className="line-clamp-2 text-sm font-semibold text-ink">{u.title}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {kindLabel(u.kind)} · {u.sourceName}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-muted">New bills, laws and court news appear here after the next sync.</p>
              )
            ) : (
              <p className="px-5 py-4 text-sm text-muted">Your free trial has ended. Subscribe to keep getting daily law, court and advocate news with new-law alerts.</p>
            )}
            <div className="border-t border-border px-5 py-3">
              <Link href="/app/updates" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                {hasUpdatesAccess(updatesAccess) ? "All updates" : "See plans"} <ArrowRight className="size-4" />
              </Link>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-start gap-3 p-5">
              <IconTile icon={ArrowLeftRight} tone="gold" />
              <div className="min-w-0">
                <Badge tone="accent" className="mb-1">
                  Free tool
                </Badge>
                <p className="font-serif text-lg leading-snug font-semibold text-ink">IPC → BNS by offence date</p>
                <p className="mt-1 text-sm text-muted">Offences before 1 July 2024 stay under the IPC. Find the right section for the date that matters.</p>
                <Link href="/app/research?tab=convert" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Open converter <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <IconTile icon={ReceiptIndianRupee} tone="gold" />
              <div>
                <p className="text-[15px] font-bold text-ink">Fee book</p>
                <p className="text-xs text-muted">This financial year</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md bg-surface-2/70 p-3">
                <dt className="text-[11px] font-semibold text-muted">Received</dt>
                <dd className="tabular mt-0.5 text-base font-bold text-success" data-private>
                  {formatINR(fees.receivedPaise)}
                </dd>
              </div>
              <div className="rounded-md bg-surface-2/70 p-3">
                <dt className="text-[11px] font-semibold text-muted">Outstanding</dt>
                <dd className="tabular mt-0.5 text-base font-bold text-ink" data-private>
                  {formatINR(fees.outstandingPaise)}
                </dd>
              </div>
            </dl>
            {fees.overdueCount ? (
              <Badge tone="danger" dot className="mt-3">
                {fees.overdueCount} overdue {fees.overdueCount === 1 ? "invoice" : "invoices"}
              </Badge>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link href="/app/fees/new">New invoice</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/app/fees">Open fee book</Link>
              </Button>
            </div>
          </Card>

          <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-surface-2/60 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
            <p className="text-xs leading-relaxed text-muted">
              <span className="font-semibold text-ink-2">Your data stays yours.</span> Every query runs under row-level security, sign-ins support two-factor codes, and
              signed documents carry a tamper-evident audit trail. <Lock className="inline size-3" />
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function HeroStat({ label, value, href, small, privateValue }: { label: string; value: string; href: string; small?: boolean; privateValue?: boolean }) {
  return (
    <Link href={href} className="min-w-0 px-3 py-3 transition-colors first:rounded-l-lg last:rounded-r-lg hover:bg-white/5 sm:px-4">
      <span
        className={cn("tabular block truncate leading-none font-semibold text-on-brand", small ? "pt-1 text-[17px] sm:text-xl" : "font-serif text-[26px] sm:text-3xl")}
        data-private={privateValue || undefined}
      >
        {value}
      </span>
      <span className="mt-1.5 block text-[11px] leading-tight font-semibold text-on-brand-muted sm:text-xs">{label}</span>
    </Link>
  );
}

function HearingRow({ h, today }: { h: HearingItem; today: string }) {
  const chip = hearingStatusChip(h, today);
  const when = h.hearingDate === today ? formatTime(h.hearingTime) ?? "Today" : relativeDay(h.hearingDate, today) ?? formatYmd(h.hearingDate, { day: "numeric", month: "short" });
  return (
    <li>
      <Link href={`/app/diary?date=${h.hearingDate}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:px-5">
        <span className="tabular w-16 shrink-0 text-[13px] leading-tight font-bold text-ink">
          {when}
          {h.itemNo ? <span className="block text-[11px] font-semibold text-muted">Item {h.itemNo}</span> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold text-ink" data-private>
            {h.caseTitle}
          </span>
          <span className="block truncate text-xs text-muted">{[hearingLocation(h), h.purpose].filter(Boolean).join(" · ") || "Court not set"}</span>
        </span>
        <Badge tone={chip.tone} dot className="hidden sm:inline-flex">
          {chip.label}
        </Badge>
        <ChevronRight className="size-4 shrink-0 text-muted" />
      </Link>
    </li>
  );
}
