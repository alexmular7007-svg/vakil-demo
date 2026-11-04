"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { banUser, setUserRole, unbanUser } from "@/app/admin/users/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { useConfirm } from "@/components/ui/confirm";

type Role = "user" | "advocate" | "admin";

export function UserActions({
  userId,
  name,
  role,
  banned,
  isSelf,
}: {
  userId: string;
  name: string;
  role: Role;
  banned: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  const [banOpen, setBanOpen] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);

  if (isSelf) return <span className="text-xs text-muted">You</span>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`role-${userId}`}>
        Role for {name}
      </label>
      <Select
        id={`role-${userId}`}
        value={role}
        disabled={pending}
        className="h-9 w-32"
        onChange={async (e) => {
          const next = e.target.value as Role;
          if (
            next === "admin" &&
            !(await confirm({ title: `Give ${name} administrator access?`, description: "Administrators can change roles, verify advocates and read the audit log.", confirmLabel: "Make admin", tone: "danger" }))
          )
            return;
          start(async () => {
            const res = await setUserRole({ userId, role: next });
            if (res.ok) {
              toast.success(`Role set to ${next}.`);
              router.refresh();
            } else toast.error(res.error);
          });
        }}
      >
        <option value="user">User</option>
        <option value="advocate">Advocate</option>
        <option value="admin">Admin</option>
      </Select>
      {banned ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await unbanUser(userId);
              if (res.ok) {
                toast.success("User unbanned.");
                router.refresh();
              } else toast.error(res.error);
            })
          }
        >
          <Undo2 /> Unban
        </Button>
      ) : (
        <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => setBanOpen(true)}>
          <Ban /> Ban
        </Button>
      )}
      {pending ? <Loader2 className="size-4 animate-spin text-muted" aria-label="Saving" /> : null}

      <Dialog open={banOpen} onClose={() => setBanOpen(false)} title={`Ban ${name}`} description="They are signed out everywhere and cannot sign in until unbanned.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const daysRaw = String(fd.get("days") ?? "");
            start(async () => {
              const res = await banUser({
                userId,
                reason: String(fd.get("reason") ?? ""),
                days: daysRaw ? Number(daysRaw) : null,
              });
              if (res.ok) {
                toast.success("User banned.");
                setBanOpen(false);
                setReasonError(null);
                router.refresh();
              } else {
                setReasonError(res.fieldErrors?.reason ?? null);
                toast.error(res.error);
              }
            });
          }}
        >
          <Field label="Reason" htmlFor={`ban-reason-${userId}`} error={reasonError} hint="Recorded in the audit log.">
            <Textarea id={`ban-reason-${userId}`} name="reason" rows={3} maxLength={500} required />
          </Field>
          <Field label="Duration in days" htmlFor={`ban-days-${userId}`} hint="Leave empty for an indefinite ban.">
            <Input id={`ban-days-${userId}`} name="days" type="number" min={1} max={3650} inputMode="numeric" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setBanOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Ban user
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
