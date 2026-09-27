"use client";

import jsQR from "jsqr";
import { Camera, CameraOff, CircleCheck, CircleX, Loader2, ScanLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form-controls";
import type { DomainErrorCode } from "@/lib/errors";
import { formatTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import { cn } from "@/lib/utils";
import { redeemCheckinAction } from "./actions";

type CameraState = "off" | "starting" | "on" | "denied" | "unavailable";

interface ScanResult {
  id: number;
  ok: boolean;
  error?: DomainErrorCode;
  memberName?: string;
  activity?: string;
  startsAt?: string;
  checkedInAt?: string;
}

const SCAN_INTERVAL_MS = 200;
const SAME_CODE_COOLDOWN_MS = 4000;

/**
 * Reception scanner: reads member QR codes with the device camera (decoded locally with jsQR)
 * or accepts a pasted/typed code when the camera is unavailable. Every code is verified by the
 * database for this venue; the screen only reports the committed result.
 */
export function CheckinScanner({ venueId, timeZone }: { venueId: string; timeZone: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastCode = useRef<{ value: string; at: number } | null>(null);
  const busy = useRef(false);
  const counter = useRef(0);
  const [camera, setCamera] = useState<CameraState>("off");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [manual, setManual] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = useCallback(
    (raw: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      startTransition(async () => {
        try {
          const response = await redeemCheckinAction(raw, venueId);
          counter.current += 1;
          const item: ScanResult = response.ok
            ? {
                id: counter.current,
                ok: true,
                memberName: response.data.memberName,
                activity: localized(response.data.activityTitle, locale),
                startsAt: response.data.sessionStartsAt,
                checkedInAt: response.data.checkedInAt,
              }
            : { id: counter.current, ok: false, error: response.error };
          setResult(item);
          setHistory((items) => [item, ...items].slice(0, 6));
          if (response.ok) {
            setManual("");
          }
          navigator.vibrate?.(response.ok ? 80 : [60, 60, 60]);
        } catch {
          counter.current += 1;
          setResult({ id: counter.current, ok: false, error: "UNEXPECTED_ERROR" });
        } finally {
          busy.current = false;
        }
      });
    },
    [venueId, locale],
  );

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCamera((state) => (state === "on" || state === "starting" ? "off" : state));
  }, []);

  // The scan loop runs outside React rendering; it always calls the latest submit function.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  function startScanLoop() {
    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !streamRef.current) {
        return;
      }
      if (!busy.current && video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        const scale = Math.min(1, 640 / video.videoWidth);
        const width = Math.round(video.videoWidth * scale);
        const height = Math.round(video.videoHeight * scale);
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          context.drawImage(video, 0, 0, width, height);
          const image = context.getImageData(0, 0, width, height);
          const code = jsQR(image.data, width, height, { inversionAttempts: "dontInvert" });
          const value = code?.data?.trim();
          if (value) {
            const now = Date.now();
            const previous = lastCode.current;
            if (!previous || previous.value !== value || now - previous.at > SAME_CODE_COOLDOWN_MS) {
              lastCode.current = { value, at: now };
              submitRef.current(value);
            }
          }
        }
      }
      timerRef.current = window.setTimeout(tick, SCAN_INTERVAL_MS);
    }
    tick();
  }

  async function startCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      setCamera("on");
      startScanLoop();
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCamera(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "unavailable");
    }
  }

  useEffect(() => stopCamera, [stopCamera]);

  const time = (iso?: string) => (iso ? formatTime(iso, locale, timeZone) : "");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="camera-heading" className="flex flex-col gap-3">
        <h2 id="camera-heading" className="text-lg font-semibold">
          {t("partner.scanner.cameraTitle")}
        </h2>
        <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-2xl bg-foreground">
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label={t("partner.scanner.videoLabel")}
            className={cn("size-full object-cover", camera === "on" ? "block" : "hidden")}
          />
          {camera !== "on" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              {camera === "starting" ? (
                <Loader2 className="size-10 animate-spin" aria-hidden="true" />
              ) : (
                <ScanLine className="size-12 opacity-80" aria-hidden="true" />
              )}
              <p className="text-sm opacity-90">{t("partner.scanner.cameraHint")}</p>
            </div>
          ) : (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-accent/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]"
            />
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="flex flex-wrap gap-2">
          {camera === "on" ? (
            <Button variant="outline" onClick={stopCamera}>
              <CameraOff aria-hidden="true" />
              {t("partner.scanner.stopCamera")}
            </Button>
          ) : (
            <Button onClick={startCamera} disabled={camera === "starting"}>
              <Camera aria-hidden="true" />
              {t("partner.scanner.startCamera")}
            </Button>
          )}
        </div>
        {camera === "denied" ? <Alert variant="warning">{t("partner.scanner.cameraDenied")}</Alert> : null}
        {camera === "unavailable" ? <Alert variant="warning">{t("partner.scanner.cameraUnavailable")}</Alert> : null}

        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (manual.trim()) {
              submit(manual);
            }
          }}
        >
          <Label htmlFor="manual-code">{t("partner.scanner.manualLabel")}</Label>
          <div className="flex gap-2">
            <Input
              id="manual-code"
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="UZFIT1:…"
              maxLength={200}
              className="font-mono"
            />
            <Button type="submit" disabled={pending || manual.trim() === ""}>
              {t("partner.scanner.checkIn")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("partner.scanner.manualHint")}</p>
        </form>
      </section>

      <section aria-labelledby="result-heading" className="flex flex-col gap-3">
        <h2 id="result-heading" className="text-lg font-semibold">
          {t("partner.scanner.resultTitle")}
        </h2>
        <div aria-live="assertive" aria-atomic="true">
          {pending ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
              <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
              {t("partner.scanner.checking")}
            </div>
          ) : result ? (
            result.ok ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-success/30 bg-success-soft p-5">
                <p className="flex items-center gap-2 text-lg font-bold text-success">
                  <CircleCheck className="size-6" aria-hidden="true" />
                  {t("partner.scanner.success")}
                </p>
                <p className="text-2xl font-extrabold">{result.memberName || t("partner.scanner.unnamed")}</p>
                <p className="text-sm">
                  {result.activity} · {time(result.startsAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("partner.scanner.checkedInAt", { time: time(result.checkedInAt) })}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive-soft p-5">
                <p className="flex items-center gap-2 text-lg font-bold text-destructive">
                  <CircleX className="size-6" aria-hidden="true" />
                  {t("partner.scanner.failure")}
                </p>
                <p>{t(`errors.${result.error ?? "UNEXPECTED_ERROR"}`)}</p>
              </div>
            )
          ) : (
            <p className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
              {t("partner.scanner.waiting")}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("partner.scanner.verifyNote")}</p>
        {history.length > 1 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t("partner.scanner.recent")}</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {history.slice(1).map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  {item.ok ? (
                    <CircleCheck className="size-4 text-success" aria-hidden="true" />
                  ) : (
                    <CircleX className="size-4 text-destructive" aria-hidden="true" />
                  )}
                  {item.ok ? `${item.memberName} · ${item.activity}` : t(`errors.${item.error ?? "UNEXPECTED_ERROR"}`)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
