"use client";

import { useEffect } from "react";

/** Registers the offline-fallback service worker in production builds only. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Installability is progressive; the app works without a service worker.
    });
  }, []);
  return null;
}
