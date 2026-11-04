import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { getTemplate } from "@/lib/drafting/catalog";
import { ChequeBounceCalculator } from "@/components/calculators/cheque-bounce-calculator";
import { ToolHeader } from "@/components/calculators/tool-header";

export const metadata: Metadata = { title: "Cheque bounce timeline" };

const NOTICE_TEMPLATE = "cheque-bounce-notice-section-138";

export default async function ChequeBounceToolPage() {
  await requireUser("/app/tools/cheque-bounce");
  const template = getTemplate(NOTICE_TEMPLATE);
  return (
    <div>
      <ToolHeader
        slug="cheque-bounce"
        title="Cheque bounce timeline"
        description="Every deadline under s. 138 and s. 142 of the Negotiable Instruments Act, 1881, from presentation to the complaint."
      />
      <ChequeBounceCalculator noticeTemplateHref={template ? `/app/drafts/new?template=${encodeURIComponent(template.slug)}` : null} />
    </div>
  );
}
