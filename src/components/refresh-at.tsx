"use client";

import { useEffect } from "react";
import { useRouter } from "@/lib/i18n/navigation";

const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

/**
 * Re-renders the server component tree when a time boundary passes (for example a free
 * cancellation deadline or the opening of the check-in window), so the page never shows an
 * action the server would now reject. `serverNow` corrects for a wrong device clock.
 */
export function RefreshAt({ times, serverNow }: { times: string[]; serverNow: string }) {
  const router = useRouter();
  const key = times.join("|");

  useEffect(() => {
    const skew = new Date(serverNow).getTime() - Date.now();
    const timers: number[] = [];
    for (const iso of key.split("|")) {
      const at = new Date(iso).getTime();
      if (!Number.isFinite(at)) {
        continue;
      }
      const delay = at - (Date.now() + skew) + 500;
      if (delay > 0 && delay <= MAX_DELAY_MS) {
        timers.push(window.setTimeout(() => router.refresh(), delay));
      }
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [key, serverNow, router]);

  return null;
}
