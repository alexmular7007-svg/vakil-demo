import { BadgeCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/display";
import { cn } from "@/lib/utils";

/** Every template shows whether an enrolled advocate has reviewed it. */
export function ReviewBadge({ reviewedBy, className }: { reviewedBy: string | null | undefined; className?: string }) {
  if (reviewedBy) {
    return (
      <Badge tone="success" className={className}>
        <BadgeCheck aria-hidden /> Reviewed by {reviewedBy}
      </Badge>
    );
  }
  return (
    <Badge tone="warning" className={cn("rounded-md whitespace-normal text-left", className)}>
      <ShieldAlert aria-hidden /> Not yet reviewed by an advocate: check before use
    </Badge>
  );
}
