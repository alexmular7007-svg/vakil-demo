import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// No per-request nonce: nonces force every page to render dynamically, which
// would give up the static, CDN-served marketing and legal pages. XSS defence
// relies on React escaping plus this policy (no third-party script origins).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // PGlite ships WASM + data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "unpdf", "mammoth"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    // PDF responses need the browser's built-in viewer, which the site-wide CSP blocks.
    // Later rules override the same header key, so these routes get a PDF-only policy.
    const pdfCsp = {
      key: "Content-Security-Policy",
      value: "default-src 'none'; object-src 'self'; style-src 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'",
    };
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/s/:token/document", headers: [pdfCsp] },
      { source: "/s/:token/final", headers: [pdfCsp] },
      { source: "/api/esign/envelopes/:id/download", headers: [pdfCsp] },
      // The service worker must always be re-checked so updates reach installed apps.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
