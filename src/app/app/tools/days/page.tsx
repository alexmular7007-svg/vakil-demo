import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { DaysCalculator } from "@/components/calculators/days-calculator";
import { ToolHeader } from "@/components/calculators/tool-header";

export const metadata: Metadata = { title: "Days and dates" };

export default async function DaysToolPage() {
  await requireUser("/app/tools/days");
  return (
    <div>
      <ToolHeader
        slug="days"
        title="Days and dates"
        description="Count the days between two dates, or find the date a number of days, months or years away."
      />
      <DaysCalculator />
    </div>
  );
}
