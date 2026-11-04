"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { MoreHorizontal, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Menu, MenuItem } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { deleteChat, renameChat, togglePinChat } from "@/app/app/chat/actions";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; updatedAt: Date | string; pinned: boolean };

export function ChatHistory({ items, className }: { items: Item[]; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [, start] = useTransition();
  const confirm = useConfirm();
  const pinned = items.filter((i) => i.pinned);
  const recent = items.filter((i) => !i.pinned);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Could not update");
      else after?.();
    });

  const group = (label: string, list: Item[]) =>
    list.length === 0 ? null : (
      <div>
        <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</p>
        <ul className="grid gap-0.5">
          {list.map((c) => {
            const active = pathname === `/app/chat/${c.id}`;
            return (
              <li key={c.id} className="group relative">
                <Link
                  href={`/app/chat/${c.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block truncate rounded-md py-2 pr-9 pl-2.5 text-sm",
                    active ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {c.title}
                </Link>
                <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                  <Menu
                    trigger={({ toggle }) => (
                      <button type="button" onClick={toggle} className="inline-flex size-7 items-center justify-center rounded text-muted hover:bg-surface hover:text-ink" aria-label={`Options for ${c.title}`}>
                        <MoreHorizontal className="size-4" />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuItem
                          onClick={() => {
                            close();
                            const t = window.prompt("Rename conversation", c.title);
                            if (t?.trim()) run(() => renameChat(c.id, t), () => router.refresh());
                          }}
                        >
                          <Pencil /> Rename
                        </MenuItem>
                        <MenuItem onClick={() => { close(); run(() => togglePinChat(c.id, !c.pinned), () => router.refresh()); }}>
                          {c.pinned ? <PinOff /> : <Pin />} {c.pinned ? "Unpin" : "Pin"}
                        </MenuItem>
                        <MenuItem
                          className="text-danger hover:text-danger"
                          onClick={async () => {
                            close();
                            if (
                              !(await confirm({
                                title: "Delete this conversation?",
                                description: "Its messages and citations are removed. This cannot be undone.",
                                confirmLabel: "Delete",
                                tone: "danger",
                              }))
                            )
                              return;
                            run(() => deleteChat(c.id), () => {
                              if (active) router.push("/app/chat");
                              router.refresh();
                            });
                          }}
                        >
                          <Trash2 /> Delete
                        </MenuItem>
                      </>
                    )}
                  </Menu>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <div className={cn("flex min-h-0 flex-col gap-4", className)}>
      <Button asChild variant="outline" className="w-full justify-start">
        <Link href="/app/chat">
          <Plus /> New conversation
        </Link>
      </Button>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin">
        {items.length === 0 ? <p className="px-2 text-sm text-muted">No conversations yet.</p> : null}
        {group("Pinned", pinned)}
        {group("Recent", recent)}
      </div>
    </div>
  );
}
