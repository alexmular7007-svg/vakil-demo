"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyCitation({ citation, text }: { citation: string; text?: string }) {
  const [done, setDone] = useState<"cite" | "text" | null>(null);
  async function copy(kind: "cite" | "text", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setDone(kind);
      toast.success(kind === "cite" ? "Citation copied" : "Section text copied");
      setTimeout(() => setDone(null), 1800);
    } catch {
      toast.error("Copying is blocked in this browser");
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => copy("cite", citation)}>
        {done === "cite" ? <Check /> : <Copy />} Copy citation
      </Button>
      {text ? (
        <Button type="button" variant="outline" size="sm" onClick={() => copy("text", `${citation}\n\n${text}`)}>
          {done === "text" ? <Check /> : <Copy />} Copy text
        </Button>
      ) : null}
    </div>
  );
}
