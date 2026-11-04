import { ImageResponse } from "next/og";
import { StaticMark } from "@/components/brand-mark-static";

// Apple touch icon: iOS applies its own rounded mask, so the navy fills the square.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <StaticMark size={180} rx={0} inset={0.12} />
      </div>
    ),
    size,
  );
}
