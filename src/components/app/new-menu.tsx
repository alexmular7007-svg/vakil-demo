"use client";

import { useRouter } from "next/navigation";
import { Briefcase, CalendarPlus, ChevronDown, FilePen, Plus, ReceiptIndianRupee, Signature, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/overlay";

const items = [
  { href: "/app/drafts/new", label: "New draft", icon: FilePen },
  { href: "/app/diary?new=1", label: "Add hearing", icon: CalendarPlus },
  { href: "/app/matters/new", label: "New matter", icon: Briefcase },
  { href: "/app/documents", label: "Upload document", icon: Upload },
  { href: "/app/sign/new", label: "Send for signature", icon: Signature },
  { href: "/app/fees/new", label: "New invoice", icon: ReceiptIndianRupee },
];

export function NewMenu() {
  const router = useRouter();
  return (
    <Menu
      trigger={({ toggle, open }) => (
        <Button size="sm" onClick={toggle} aria-expanded={open} aria-haspopup="menu" className="h-10 px-3.5">
          <Plus /> New <ChevronDown className="opacity-70" />
        </Button>
      )}
    >
      {(close) =>
        items.map((i) => (
          <MenuItem
            key={i.href}
            onClick={() => {
              close();
              router.push(i.href);
            }}
          >
            <i.icon /> {i.label}
          </MenuItem>
        ))
      }
    </Menu>
  );
}
