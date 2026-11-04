"use client";

import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { ecourtsUrl } from "@/lib/diary/links";
import { cn } from "@/lib/utils";

/**
 * Copies the CNR and opens the official eCourts CNR search in a new tab. The
 * portal needs a captcha, so the advocate pastes the CNR there themselves.
 */
export async function copyCnrForEcourts(cnr: string) {
  try {
    await navigator.clipboard.writeText(cnr);
    toast.success("CNR copied", { description: "Paste it into the CNR search on eCourts and fill in the captcha there." });
  } catch {
    toast.message(`CNR ${cnr}`, { description: "Copy this number and paste it into the CNR search on eCourts." });
  }
}

export function EcourtsLink({
  cnr,
  court,
  size = "sm",
  variant = "outline",
  className,
  children,
}: {
  cnr: string;
  court?: string | null;
  size?: "sm" | "md";
  variant?: "outline" | "secondary";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={ecourtsUrl(cnr, court)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => void copyCnrForEcourts(cnr)}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {children ?? (
        <>
          <ExternalLink /> Open on eCourts
        </>
      )}
    </a>
  );
}
