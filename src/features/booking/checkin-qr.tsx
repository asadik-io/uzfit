"use client";

import { Check, Copy, Loader2, QrCode, RefreshCw, SunMedium } from "lucide-react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { QR_PREFIX } from "@/lib/checkin";
import type { DomainErrorCode } from "@/lib/errors";
import { useRouter } from "@/lib/i18n/navigation";
import { getBookingStateAction, issueCheckinTokenAction } from "./actions";

const TOKEN_TTL_MS = 60_000;
/** Automatic refreshes before asking for a tap, to stay well inside the issuance rate limit. */
const MAX_AUTO_REFRESHES = 20;
const STATE_POLL_MS = 4_000;

interface ShownToken {
  payload: string;
  svg: string;
  expiresAt: number;
}

/**
 * Member-side check-in code. Each code is a fresh 60-second token from the database (only its
 * hash is stored); a new code revokes the previous one. The code refreshes itself while the page
 * is visible, and the page updates as soon as reception completes the check-in.
 */
export function CheckinQr({ bookingId }: { bookingId: string }) {
  const t = useTranslations("checkin");
  const router = useRouter();
  const [shown, setShown] = useState<ShownToken | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<DomainErrorCode | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const autoRefreshes = useRef(0);
  const requesting = useRef(false);

  const issue = useCallback(
    (manual: boolean) => {
      if (requesting.current) {
        return;
      }
      requesting.current = true;
      if (manual) {
        autoRefreshes.current = 0;
      }
      startTransition(async () => {
        try {
          const result = await issueCheckinTokenAction(bookingId);
          if (!result.ok) {
            setShown(null);
            setError(result.error);
            if (["ALREADY_CHECKED_IN", "BOOKING_NOT_ACTIVE", "OUTSIDE_CHECKIN_WINDOW"].includes(result.error)) {
              router.refresh();
            }
            return;
          }
          const ttl = Math.min(
            Math.max(new Date(result.data.expiresAt).getTime() - new Date(result.data.serverNow).getTime(), 0),
            TOKEN_TTL_MS,
          );
          const payload = `${QR_PREFIX}${result.data.token}`;
          const svg = await QRCode.toString(payload, {
            type: "svg",
            errorCorrectionLevel: "M",
            margin: 1,
            color: { dark: "#0f172a", light: "#ffffff" },
          });
          setError(null);
          setNeedsTap(false);
          setCopied(false);
          setShown({ payload, svg, expiresAt: Date.now() + ttl });
          setRemaining(ttl);
        } catch {
          setShown(null);
          setError("UNEXPECTED_ERROR");
        } finally {
          requesting.current = false;
        }
      });
    },
    [bookingId, router],
  );

  // Countdown and automatic refresh while the page is visible.
  useEffect(() => {
    if (!shown) {
      return;
    }
    const tick = () => {
      const left = Math.max(shown.expiresAt - Date.now(), 0);
      setRemaining(left);
      if (left <= 1_000 && document.visibilityState === "visible") {
        if (autoRefreshes.current < MAX_AUTO_REFRESHES) {
          autoRefreshes.current += 1;
          issue(false);
        } else {
          setNeedsTap(true);
        }
      }
    };
    const timer = window.setInterval(tick, 250);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [shown, issue]);

  // Reception scans the code on their device; notice the completed check-in here.
  useEffect(() => {
    if (!shown) {
      return;
    }
    let active = true;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      const result = await getBookingStateAction(bookingId);
      if (active && result.ok && result.data.state !== "confirmed") {
        active = false;
        window.clearInterval(timer);
        setShown(null);
        router.refresh();
      }
    }, STATE_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [shown, bookingId, router]);

  async function copy() {
    if (!shown) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shown.payload);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const seconds = Math.ceil(remaining / 1000);
  const expired = shown !== null && remaining <= 0;

  if (!shown) {
    return (
      <div className="flex flex-col gap-3">
        <FormError code={error} />
        <Button size="lg" onClick={() => issue(true)} disabled={pending} className="w-full sm:w-auto">
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <QrCode aria-hidden="true" />}
          {t("show")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        role="img"
        aria-label={t("qrLabel")}
        className={`relative size-64 max-w-full rounded-2xl border border-border bg-white p-3 shadow-sm [&>div>svg]:size-full ${expired || needsTap ? "opacity-30" : ""}`}
      >
        {/* The markup is generated locally by the qrcode library from an opaque token. */}
        <div className="size-full" dangerouslySetInnerHTML={{ __html: shown.svg }} />
      </div>
      <div className="flex w-full max-w-64 flex-col gap-1.5" aria-hidden="true">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear motion-reduce:transition-none"
            style={{ width: `${(remaining / TOKEN_TTL_MS) * 100}%` }}
          />
        </div>
        <p className="text-center text-sm text-muted-foreground tabular-nums">
          {pending ? t("refreshing") : expired || needsTap ? t("expired") : t("expiresIn", { seconds })}
        </p>
      </div>
      <p className="sr-only" aria-live="polite">
        {needsTap ? t("expired") : t("srHint")}
      </p>
      {needsTap || expired ? (
        <Button onClick={() => issue(true)} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          {t("refresh")}
        </Button>
      ) : null}
      <FormError code={error} />
      <p className="flex items-center gap-2 text-center text-sm text-muted-foreground">
        <SunMedium className="size-4 shrink-0" aria-hidden="true" />
        {t("brightnessTip")}
      </p>
      <details className="w-full rounded-xl bg-muted p-3 text-sm">
        <summary className="cursor-pointer font-medium">{t("cantScan")}</summary>
        <p className="mt-2 text-muted-foreground">{t("cantScanText")}</p>
        <p className="mt-2 rounded-lg bg-card p-2 font-mono text-xs break-all">{shown.payload}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={copy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </details>
    </div>
  );
}
