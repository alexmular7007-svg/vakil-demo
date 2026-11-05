import "server-only";
import { connection } from "next/server";
import { and, asc, desc, eq, gt, gte, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { withUser, type Tx } from "@/lib/db";
import { documents, hearings, matters, tasks } from "@/lib/db/schema";
import type { Notice } from "@/lib/notifications";
import { addDays, compareHearings, formatTime, formatYmd, istInstant, todayIST, weekDays } from "./dates";
import { toStatus, type HearingItem, type MatterOption, type TaskItem } from "./types";

export type { HearingItem, TaskItem, MatterOption } from "./types";

const nextHearing = alias(hearings, "next_hearing");

const hearingCols = {
  id: hearings.id,
  matterId: hearings.matterId,
  caseTitle: hearings.caseTitle,
  court: hearings.court,
  bench: hearings.bench,
  itemNo: hearings.itemNo,
  hearingTime: hearings.hearingTime,
  purpose: hearings.purpose,
  hearingDate: hearings.hearingDate,
  status: hearings.status,
  caseNo: hearings.caseNo,
  cnr: hearings.cnr,
  notes: hearings.notes,
  outcome: hearings.outcome,
  nextHearingId: hearings.nextHearingId,
  nextHearingDate: nextHearing.hearingDate,
};

function selectHearings(tx: Tx) {
  return tx.select(hearingCols).from(hearings).leftJoin(nextHearing, eq(nextHearing.id, hearings.nextHearingId));
}

async function listHearings(
  tx: Tx,
  userId: string,
  where: ReturnType<typeof and>,
  opts: { limit: number; order?: "asc" | "desc" },
): Promise<HearingItem[]> {
  const rows = await selectHearings(tx)
    .where(and(eq(hearings.ownerId, userId), where))
    .orderBy(opts.order === "desc" ? desc(hearings.hearingDate) : asc(hearings.hearingDate), asc(hearings.hearingTime), asc(hearings.createdAt))
    .limit(opts.limit);
  const items: HearingItem[] = rows.map((r) => ({ ...r, status: toStatus(r.status) }));
  // Newest day first for "desc", but always in board order within a day.
  return items.sort((a, b) =>
    opts.order === "desc" && a.hearingDate !== b.hearingDate ? (a.hearingDate < b.hearingDate ? 1 : -1) : compareHearings(a, b),
  );
}

const taskCols = {
  id: tasks.id,
  title: tasks.title,
  dueDate: tasks.dueDate,
  matterId: tasks.matterId,
  matterTitle: matters.title,
  done: tasks.done,
};

async function listTasks(tx: Tx, userId: string, opts: { matterId?: string; limit?: number; dueBy?: string }): Promise<TaskItem[]> {
  const scope = and(eq(tasks.ownerId, userId), opts.matterId ? eq(tasks.matterId, opts.matterId) : undefined);
  const [open, recentDone] = await Promise.all([
    tx
      .select(taskCols)
      .from(tasks)
      .leftJoin(matters, eq(matters.id, tasks.matterId))
      .where(and(scope, eq(tasks.done, false), opts.dueBy ? lte(tasks.dueDate, opts.dueBy) : undefined))
      .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.createdAt))
      .limit(opts.limit ?? 100),
    // Ticked off in the last three days: stays visible (struck through) so a mis-tap can be undone.
    opts.dueBy
      ? Promise.resolve([])
      : tx
          .select(taskCols)
          .from(tasks)
          .leftJoin(matters, eq(matters.id, tasks.matterId))
          .where(and(scope, eq(tasks.done, true), gt(tasks.doneAt, sql`now() - interval '3 days'`)))
          .orderBy(desc(tasks.doneAt))
          .limit(5),
  ]);
  return [...open, ...recentDone];
}

async function boardCounts(tx: Tx, userId: string, today: string) {
  const weekEnd = addDays(today, 6);
  const [h] = await tx
    .select({
      today: sql<number>`count(*) filter (where ${hearings.hearingDate} = ${today})::int`,
      week: sql<number>`count(*)::int`,
    })
    .from(hearings)
    .where(and(eq(hearings.ownerId, userId), gte(hearings.hearingDate, today), lte(hearings.hearingDate, weekEnd), ne(hearings.status, "cancelled")));
  const [t] = await tx
    .select({ overdue: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.ownerId, userId), eq(tasks.done, false), lt(tasks.dueDate, today)));
  return { today: h?.today ?? 0, week: h?.week ?? 0, overdueTasks: t?.overdue ?? 0 };
}

/* --------------------------------------------------------------------------
 * Public API for the dashboard and notifications
 * ------------------------------------------------------------------------ */

/**
 * Today's board for the home screen. "Today" is the current date in IST.
 * today = hearings listed today (not cancelled); upcoming = the next 7 days
 * (scheduled, max 8); tasksDue = open tasks due today or earlier (max 8).
 */
export async function getDiaryBoard(
  userId: string,
  txOpt?: Tx,
): Promise<{
  today: HearingItem[];
  upcoming: HearingItem[];
  tasksDue: TaskItem[];
  counts: { today: number; week: number; overdueTasks: number };
}> {
  await connection();
  const today = todayIST();
  const run = async (tx: Tx) => {
    const [todayList, upcoming, tasksDue, counts] = await Promise.all([
      listHearings(tx, userId, and(eq(hearings.hearingDate, today), ne(hearings.status, "cancelled")), { limit: 50 }),
      listHearings(tx, userId, and(gt(hearings.hearingDate, today), lte(hearings.hearingDate, addDays(today, 7)), eq(hearings.status, "scheduled")), {
        limit: 8,
      }),
      listTasks(tx, userId, { dueBy: today, limit: 8 }),
      boardCounts(tx, userId, today),
    ]);
    return { today: todayList, upcoming, tasksDue, counts };
  };
  return txOpt ? run(txOpt) : withUser(userId, run);
}

/** Diary notices for the bell: hearings today (urgent) and tomorrow, and overdue open tasks. */
export async function hearingNotices(
  userId: string,
  txOpt?: Tx,
): Promise<Notice[]> {
  const today = todayIST();
  const tomorrow = addDays(today, 1);
  const run = async (tx: Tx) => {
    const [soon, overdue] = await Promise.all([
      listHearings(tx, userId, and(gte(hearings.hearingDate, today), lte(hearings.hearingDate, tomorrow), eq(hearings.status, "scheduled")), {
        limit: 10,
      }),
      tx
        .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate })
        .from(tasks)
        .where(and(eq(tasks.ownerId, userId), eq(tasks.done, false), isNotNull(tasks.dueDate), lt(tasks.dueDate, today)))
        .orderBy(asc(tasks.dueDate))
        .limit(5),
    ]);
    const out: Notice[] = soon.map((h) => {
      const isToday = h.hearingDate === today;
      const detail = [isToday ? "Today" : "Tomorrow", formatTime(h.hearingTime), h.itemNo ? `Item ${h.itemNo}` : null, h.court].filter(Boolean).join(" · ");
      return {
        id: `hearing-${h.id}`,
        kind: "hearing",
        title: h.caseTitle,
        detail,
        href: `/app/diary?date=${h.hearingDate}&hearing=${h.id}`,
        at: istInstant(h.hearingDate, h.hearingTime),
        urgent: isToday,
      };
    });
    for (const t of overdue) {
      if (!t.dueDate) continue;
      out.push({
        id: `task-${t.id}`,
        kind: "hearing",
        title: t.title,
        detail: `Task overdue since ${formatYmd(t.dueDate, { day: "numeric", month: "short" })}`,
        href: "/app/diary#tasks",
        at: istInstant(t.dueDate),
        urgent: true,
      });
    }
    return out;
  };
  return txOpt ? run(txOpt) : withUser(userId, run);
}

/* --------------------------------------------------------------------------
 * Page data
 * ------------------------------------------------------------------------ */

export type DiaryPageData = {
  today: string;
  day: HearingItem[];
  week: { date: string; count: number }[];
  upcoming: HearingItem[];
  awaiting: HearingItem[];
  awaitingTotal: number;
  tasks: TaskItem[];
  matters: MatterOption[];
  orderDocs: { id: string; name: string; matterId: string | null }[];
  counts: { today: number; week: number; overdueTasks: number };
  focus: HearingItem | null;
};

/** Everything /app/diary needs for one selected date. */
export async function getDiaryPageData(userId: string, selected: string, focusId: string | null): Promise<DiaryPageData> {
  await connection();
  const today = todayIST();
  const days = weekDays(selected);
  return withUser(userId, async (tx) => {
    const [day, weekRows, upcoming, awaiting, awaitingCount, taskList, matterRows, orderDocs, counts, focus] = await Promise.all([
      listHearings(tx, userId, eq(hearings.hearingDate, selected), { limit: 200 }),
      tx
        .select({ date: hearings.hearingDate, count: sql<number>`count(*)::int` })
        .from(hearings)
        .where(and(eq(hearings.ownerId, userId), gte(hearings.hearingDate, days[0]), lte(hearings.hearingDate, days[6]), ne(hearings.status, "cancelled")))
        .groupBy(hearings.hearingDate),
      listHearings(tx, userId, and(gt(hearings.hearingDate, today), lte(hearings.hearingDate, addDays(today, 30)), eq(hearings.status, "scheduled")), {
        limit: 80,
      }),
      listHearings(tx, userId, and(lt(hearings.hearingDate, today), eq(hearings.status, "scheduled")), { limit: 6, order: "desc" }),
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(hearings)
        .where(and(eq(hearings.ownerId, userId), lt(hearings.hearingDate, today), eq(hearings.status, "scheduled"))),
      listTasks(tx, userId, {}),
      tx
        .select({ id: matters.id, title: matters.title, court: matters.court, caseNo: matters.caseNo, cnr: matters.cnr, clientName: matters.clientName })
        .from(matters)
        .where(and(eq(matters.ownerId, userId), eq(matters.status, "open")))
        .orderBy(desc(matters.updatedAt))
        .limit(300),
      tx
        .select({ id: documents.id, name: documents.name, matterId: documents.matterId })
        .from(documents)
        .where(and(eq(documents.ownerId, userId), eq(documents.status, "ready"), isNotNull(documents.textContent)))
        .orderBy(desc(documents.createdAt))
        .limit(40),
      boardCounts(tx, userId, today),
      focusId ? listHearings(tx, userId, eq(hearings.id, focusId), { limit: 1 }) : Promise.resolve([]),
    ]);
    const byDate = new Map(weekRows.map((r) => [r.date, r.count]));
    return {
      today,
      day,
      week: days.map((date) => ({ date, count: byDate.get(date) ?? 0 })),
      upcoming,
      awaiting,
      awaitingTotal: awaitingCount[0]?.n ?? 0,
      tasks: taskList,
      matters: matterRows,
      orderDocs,
      counts,
      focus: focus[0] ?? null,
    };
  });
}

/** Hearings (upcoming ascending, past newest first) and tasks for one matter. */
export async function getMatterDiary(
  userId: string,
  matterId: string,
): Promise<{ today: string; upcoming: HearingItem[]; past: HearingItem[]; tasks: TaskItem[] }> {
  await connection();
  const today = todayIST();
  return withUser(userId, async (tx) => {
    const [upcoming, past, taskList] = await Promise.all([
      listHearings(tx, userId, and(eq(hearings.matterId, matterId), gte(hearings.hearingDate, today)), { limit: 50 }),
      listHearings(tx, userId, and(eq(hearings.matterId, matterId), lt(hearings.hearingDate, today)), { limit: 50, order: "desc" }),
      listTasks(tx, userId, { matterId }),
    ]);
    return { today, upcoming, past, tasks: taskList };
  });
}

/** Scheduled hearings from today on, for the .ics export (or one hearing by id). */
export async function getHearingsForExport(userId: string, opts: { id?: string; today: string }): Promise<HearingItem[]> {
  return withUser(userId, (tx) =>
    opts.id
      ? listHearings(tx, userId, eq(hearings.id, opts.id), { limit: 1 })
      : listHearings(tx, userId, and(gte(hearings.hearingDate, opts.today), lte(hearings.hearingDate, addDays(opts.today, 400)), eq(hearings.status, "scheduled")), {
          limit: 1000,
        }),
  );
}
