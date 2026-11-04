import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { InterestCalculator } from "@/components/calculators/interest-calculator";
import { ToolHeader } from "@/components/calculators/tool-header";

export const metadata: Metadata = { title: "Interest calculator" };

export default async function InterestToolPage() {
  await requireUser("/app/tools/interest");
  return (
    <div>
      <ToolHeader
        slug="interest"
        title="Interest calculator"
        description="Simple or compound interest on a principal between two dates, with a period-by-period breakdown."
      />
      <InterestCalculator />
    </div>
  );
}
