import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/display";
import { calculatorInfo, type CalculatorSlug } from "./catalog";

/** Page header for a calculator inside the workspace. */
export function ToolHeader({ slug, title, description }: { slug: CalculatorSlug; title: string; description: string }) {
  const info = calculatorInfo(slug);
  return (
    <PageHeader
      eyebrow="Calculators"
      icon={info.icon}
      title={title}
      description={description}
      actions={
        <Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-9">
          <Link href="/app/tools">
            <ArrowLeft aria-hidden /> All calculators
          </Link>
        </Button>
      }
    />
  );
}
