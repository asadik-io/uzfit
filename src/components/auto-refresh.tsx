"use client";

import { useEffect } from "react";
import { useRouter } from "@/lib/i18n/navigation";

/**
 * Periodically re-renders server state (for example while a payment is being confirmed), for at
 * most `maxMs`. The page shows whatever the server reports; nothing is inferred on the client.
 */
export function AutoRefresh({ intervalMs = 3000, maxMs = 120_000 }: { intervalMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > maxMs) {
        window.clearInterval(timer);
        return;
      }
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, maxMs, router]);
  return null;
}
