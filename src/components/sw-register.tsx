"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker (public/sw.js) in production builds only;
 * in development it would serve stale bundles.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* unsupported or blocked: the site works without it */
    });
  }, []);
  return null;
}

/** Drops cached public pages, e.g. on sign-out on a shared device. */
export function clearOfflinePages() {
  navigator.serviceWorker?.controller?.postMessage("clear-pages");
}
