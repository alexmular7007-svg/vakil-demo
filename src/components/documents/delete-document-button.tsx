"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDocument } from "@/app/app/documents/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";

export function DeleteDocumentButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const remove = () =>
    start(async () => {
      const res = await deleteDocument({ documentId: id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      toast.success("Document deleted");
      router.push("/app/documents");
    });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="text-danger hover:text-danger">
        <Trash2 /> Delete
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this document?"
        description="The file, its extracted text and search index will be permanently removed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
            </Button>
          </>
        }
      >
        <p className="text-sm break-words text-ink-2">“{name}” will be deleted. This cannot be undone.</p>
      </Dialog>
    </>
  );
}
