"use client";

import { useState } from "react";
import { CalendarPlus, Download, Ellipsis, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/overlay";
import { useDiary } from "./diary-provider";
import { ReadOrderDialog, type OrderDoc } from "./read-order";

const ICS_HREF = "/api/diary/ics";

/** The export is a file download (Content-Disposition: attachment), not a page. */
function downloadIcs() {
  const a = document.createElement("a");
  a.href = ICS_HREF;
  a.download = "";
  a.click();
}

/** Page actions: add hearing, read an order (AI), export .ics. Secondary actions fold into a menu on phones. */
export function DiaryHeaderActions({ docs, aiEnabled }: { docs: OrderDoc[]; aiEnabled: boolean }) {
  const { newHearing } = useDiary();
  const [reading, setReading] = useState(false);
  return (
    <>
      <div className="hidden gap-2 sm:flex">
        <Button variant="outline" asChild>
          <a href={ICS_HREF} download>
            <Download /> Export .ics
          </a>
        </Button>
        <Button variant="outline" onClick={() => setReading(true)}>
          <Sparkles /> Read an order
        </Button>
      </div>
      <Button onClick={() => newHearing()} className="flex-1 sm:flex-none">
        <CalendarPlus /> Add hearing
      </Button>
      <div className="sm:hidden">
        <Menu
          trigger={({ toggle, open }) => (
            <Button variant="outline" size="icon" onClick={toggle} aria-expanded={open} aria-haspopup="menu" aria-label="More diary actions">
              <Ellipsis />
            </Button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                className="min-h-11"
                onClick={() => {
                  close();
                  setReading(true);
                }}
              >
                <Sparkles /> Read an order
              </MenuItem>
              <MenuItem
                className="min-h-11"
                onClick={() => {
                  close();
                  downloadIcs();
                }}
              >
                <Download /> Export to calendar (.ics)
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
      <ReadOrderDialog open={reading} onClose={() => setReading(false)} docs={docs} aiEnabled={aiEnabled} />
    </>
  );
}
