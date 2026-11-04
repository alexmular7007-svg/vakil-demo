import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { LimitationCalculator } from "@/components/calculators/limitation-calculator";
import { ToolHeader } from "@/components/calculators/tool-header";

export const metadata: Metadata = { title: "Limitation calculator" };

export default async function LimitationToolPage() {
  await requireUser("/app/tools/limitation");
  return (
    <div>
      <ToolHeader
        slug="limitation"
        title="Limitation calculator"
        description="Last day for a suit, appeal or application under the Limitation Act, 1963, with the first day excluded, certified-copy time and court closures applied."
      />
      <LimitationCalculator />
    </div>
  );
}
