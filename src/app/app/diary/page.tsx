import type { Metadata } from "next";
import { connection } from "next/server";
import { CalendarDays } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { daysBetween, isYmd, todayIST } from "@/lib/diary/dates";
import { getDiaryPageData } from "@/lib/diary/queries";
import { features } from "@/lib/env";
import { PageHeader } from "@/components/ui/display";
import { DiaryHeaderActions } from "@/components/diary/diary-header";
import { DiaryProvider } from "@/components/diary/diary-provider";
import { AwaitingOutcome, DayList, UpcomingList } from "@/components/diary/lists";
import { TasksCard } from "@/components/diary/tasks-card";
import { WeekStrip } from "@/components/diary/week-strip";

export const metadata: Metadata = { title: "Case diary" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function DiaryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser("/app/diary");
  const sp = await searchParams;
  await connection();
  const today = todayIST();

  const asked = one(sp.date);
  // Ten years either way is plenty for a diary and keeps junk dates out of queries.
  const selected = isYmd(asked) && Math.abs(daysBetween(today, asked)) <= 3660 ? asked : today;
  const focusParam = one(sp.hearing);
  const focusId = focusParam && z.uuid().safeParse(focusParam).success ? focusParam : null;

  const data = await getDiaryPageData(user.id, selected, focusId);

  return (
    <DiaryProvider
      today={data.today}
      defaultDate={selected}
      selectedDate={selected}
      matters={data.matters}
      focus={data.focus}
      jumpToDate
      watchUrl
    >
      <PageHeader
        eyebrow="Practice"
        title="Case diary"
        icon={CalendarDays}
        description="What is listed, where and at which item. Record the outcome and the next date follows."
        actions={<DiaryHeaderActions docs={data.orderDocs} aiEnabled={features.ai} />}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <WeekStrip selected={selected} today={data.today} week={data.week} counts={data.counts} />
          <DayList date={selected} items={data.day} />
          <TasksCard tasks={data.tasks} today={data.today} matters={data.matters} />
        </div>
        <aside className="min-w-0 space-y-6" aria-label="Upcoming and pending">
          <AwaitingOutcome items={data.awaiting} total={data.awaitingTotal} />
          <UpcomingList items={data.upcoming} />
        </aside>
      </div>
    </DiaryProvider>
  );
}
