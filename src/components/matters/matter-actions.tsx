"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteMatter, setMatterStatus } from "@/app/app/matters/actions";
import { useConfirm } from "@/components/ui/confirm";

export function MatterActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  return (
    <>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setMatterStatus(id, status === "open" ? "closed" : "open");
            if (!r.ok) toast.error(r.error);
            else router.refresh();
          })
        }
      >
        {status === "open" ? <Archive /> : <ArchiveRestore />} {status === "open" ? "Close matter" : "Reopen"}
      </Button>
      <Button
        variant="ghost"
        className="text-danger hover:text-danger"
        disabled={pending}
        onClick={async () => {
          if (
            !(await confirm({
              title: "Delete this matter?",
              description: "Conversations, drafts, documents and hearings stay, but are unlinked from it.",
              tone: "danger",
            }))
          )
            return;
          start(async () => {
            const r = await deleteMatter(id);
            if (!r.ok) toast.error(r.error);
            else router.push("/app/matters");
          });
        }}
      >
        <Trash2 /> Delete
      </Button>
    </>
  );
}
