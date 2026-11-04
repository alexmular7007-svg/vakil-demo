"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Avatar, Badge } from "@/components/ui/display";
import { Menu, MenuItem } from "@/components/ui/overlay";
import { clearOfflinePages } from "@/components/sw-register";
import { ThemeToggle } from "@/components/theme-toggle";

export type MenuUser = { name: string; email: string; role: string; image: string | null; advocateVerified: boolean };

export function UserMenu({ user }: { user: MenuUser }) {
  const router = useRouter();
  return (
    <Menu
      align="end"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Account menu"
          className="flex cursor-pointer items-center gap-2.5 rounded-full p-0.5 text-left hover:bg-surface-2 xl:rounded-md xl:py-1 xl:pr-2 xl:pl-1"
        >
          <Avatar name={user.name} src={user.image} className="size-9" />
          <span className="hidden max-w-36 min-w-0 xl:block">
            <span className="block truncate text-[13px] font-bold text-ink">{user.name}</span>
            <span className="block truncate text-[11px] text-muted">{user.advocateVerified ? "Verified advocate" : user.role === "admin" ? "Administrator" : "Member"}</span>
          </span>
          <ChevronsUpDown className="hidden size-4 text-muted xl:block" />
        </button>
      )}
    >
      {(close) => (
        <div className="w-60">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <div className="mt-1.5 flex gap-1.5">
              {user.role === "admin" ? <Badge tone="accent">Admin</Badge> : null}
              {user.advocateVerified ? (
                <Badge tone="success">
                  <ShieldCheck /> Verified advocate
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="my-1 h-px bg-border" />
          <MenuItem onClick={() => { close(); router.push("/app/settings"); }}>
            <UserRound /> Profile
          </MenuItem>
          <MenuItem onClick={() => { close(); router.push("/app/settings/security"); }}>
            <Settings /> Security & 2FA
          </MenuItem>
          {user.role === "admin" ? (
            <MenuItem onClick={() => { close(); router.push("/admin"); }}>
              <ShieldCheck /> Admin console
            </MenuItem>
          ) : null}
          <div className="flex items-center justify-between px-2.5 py-2 text-sm text-ink-2">
            Theme <ThemeToggle />
          </div>
          <div className="my-1 h-px bg-border" />
          <MenuItem
            onClick={async () => {
              close();
              clearOfflinePages();
              await authClient.signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut /> Sign out
          </MenuItem>
          <Link href="/legal/privacy" className="block px-2.5 pt-1 pb-1.5 text-[11px] text-muted hover:text-ink" onClick={close}>
            Privacy · Terms · Disclaimer
          </Link>
        </div>
      )}
    </Menu>
  );
}
