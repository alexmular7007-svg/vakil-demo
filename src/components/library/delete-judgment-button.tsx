"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteJudgment } from "@/app/admin/library/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";

export function DeleteJudgmentButton({ id, title, redirectTo }: { id: string; title: string; redirectTo?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button type="button" variant="ghost" size="icon" className="text-muted hover:text-danger" aria-label={`Delete ${title}`} onClick={() => setOpen(true)}>
        <Trash2 />
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this judgment?"
        description="It is removed from the library and the AI stops citing it. The deletion is written to the audit log."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteJudgment(id);
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Judgment deleted.");
                  setOpen(false);
                  if (redirectTo) router.push(redirectTo);
                  else router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
            </Button>
          </>
        }
      >
        <p className="text-sm font-medium text-ink">{title}</p>
      </Dialog>
    </>
  );
}
