import type { Metadata, Viewport } from "next";
import { Inter, Newsreader, Noto_Sans_Devanagari, Noto_Serif_Devanagari } from "next/font/google";
import { Providers } from "@/components/providers";
import { site } from "@/lib/site";
import "./globals.css";

const ui = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
// Optical sizes keep the serif crisp from 14px labels up to 40px titles.
const display = Newsreader({ subsets: ["latin"], variable: "--font-display", display: "swap", axes: ["opsz"] });
// Hindi headings pair with the serif display face; loaded only when Devanagari text appears.
const devanagariSerif = Noto_Serif_Devanagari({
  subsets: ["devanagari"],
  weight: ["500", "600", "700"],
  variable: "--font-devanagari-serif",
  display: "swap",
  preload: false,
});
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name}: Legal AI for Indian advocates`, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
  keywords: [
    "legal AI India",
    "AI for advocates",
    "legal drafting AI",
    "BNS IPC converter",
    "Indian legal research",
    "e-sign India",
  ],
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: "en_IN",
    url: site.url,
    title: `${site.name}: Legal AI for Indian advocates`,
    description: site.description,
  },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-icon",
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#060b17" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-IN"
      suppressHydrationWarning
      className={`${ui.variable} ${display.variable} ${devanagari.variable} ${devanagariSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
