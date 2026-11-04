import { ImageResponse } from "next/og";
import { StaticMark } from "@/components/brand-mark-static";

// The Vaakil AI mark (see LogoMark in src/components/brand.tsx): gold lapels forming
// a "V" around an advocate's white bands, on a court-navy tile.

export function generateImageMetadata() {
  return [
    { id: "32", size: { width: 32, height: 32 }, contentType: "image/png" },
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
    { id: "maskable", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

const SIZES: Record<string, number> = { "32": 32, "192": 192, "512": 512, maskable: 512 };

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const key = String(await id);
  const px = SIZES[key] ?? 32;
  // Maskable icons fill the canvas and keep the mark inside the central safe zone.
  const maskable = key === "maskable";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
        <StaticMark size={px} rx={maskable ? 0 : 13} inset={maskable ? 0.22 : 0} />
      </div>
    ),
    { width: px, height: px },
  );
}
