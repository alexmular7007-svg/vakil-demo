import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name}: Legal AI for Indian advocates`,
    short_name: site.name,
    description: site.description,
    id: "/app",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "en-IN",
    dir: "ltr",
    categories: ["productivity", "business", "education"],
    background_color: "#0b1630",
    theme_color: "#0b1630",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ask AI", url: "/app/chat" },
      { name: "Case diary", url: "/app/diary" },
      { name: "New draft", url: "/app/drafts/new" },
      { name: "Research bare acts", url: "/app/research" },
    ],
  };
}
