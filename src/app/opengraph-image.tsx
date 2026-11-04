import { ImageResponse } from "next/og";
import { StaticMark } from "@/components/brand-mark-static";

export const alt = "Vaakil AI: legal AI for Indian advocates that shows its sources";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const chips = ["Cited research", "Case diary", "Drafting", "E-sign", "IPC → BNS"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0b1630 0%, #1a3168 100%)",
          color: "#f4efe3",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <StaticMark size={76} />
          <div style={{ display: "flex", alignItems: "center", fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
            Vaakil
            <span style={{ marginLeft: 12, fontSize: 22, fontFamily: "sans-serif", fontWeight: 800, letterSpacing: 3, color: "#e2c178", padding: "4px 10px", borderRadius: 8, background: "rgba(226,193,120,0.15)" }}>
              AI
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: 80, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2, maxWidth: 1000 }}>
            The legal workspace that&nbsp;<span style={{ color: "#e2c178", fontStyle: "italic" }}>shows its sources.</span>
          </div>
          <div style={{ display: "flex", fontSize: 30, fontFamily: "sans-serif", color: "#aeb8cf", maxWidth: 980, lineHeight: 1.35 }}>
            Research Indian law, draft court-ready documents, run your case diary and collect signatures, with every citation checked.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "sans-serif" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {chips.map((c) => (
              <div key={c} style={{ display: "flex", padding: "10px 18px", borderRadius: 999, border: "2px solid rgba(226,193,120,0.45)", fontSize: 21, color: "#e9cb8a" }}>
                {c}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#aeb8cf" }}>English and हिन्दी</div>
        </div>
      </div>
    ),
    size,
  );
}
