"use client";

import { CalendarClock, Loader2, MapPin, Ticket } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { DomainErrorCode } from "@/lib/errors";
import { formatDate, formatDateTime, formatTimeRange, timeZoneLabel } from "@/lib/format";
import { useRouter } from "@/lib/i18n/navigation";
import { bookSessionAction } from "./actions";

export interface BookSessionDialogProps {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  activityTitle: string;
  venueName: string;
  venueAddress: string;
  timeZone: string;
  freeCancellationMinutes: number;
  visitsAvailable: number;
}

export function BookSessionDialog(props: BookSessionDialogProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [error, setError] = useState<DomainErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const [deadlinePassed, setDeadlinePassed] = useState(false);

  const deadline = new Date(new Date(props.startsAt).getTime() - props.freeCancellationMinutes * 60_000);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // One key per confirmation dialog: a retried or double-submitted request replays safely.
      setIdempotencyKey(crypto.randomUUID());
      setError(null);
      // Informational only; the database applies the rule with its own clock. This runs in an
      // event handler (dialog opening), not during render.
      // eslint-disable-next-line react-hooks/purity
      setDeadlinePassed(Date.now() > deadline.getTime());
    }
  }

  function confirm() {
    if (!idempotencyKey) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await bookSessionAction(props.sessionId, idempotencyKey);
      if (result.ok) {
        router.push(`/bookings/${result.data.bookingId}?created=1`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">{t("venue.bookSession")}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("booking.confirmTitle")}</DialogTitle>
          <DialogDescription>{t("booking.confirmDescription")}</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 rounded-xl bg-muted p-4 text-sm">
          <div className="flex gap-3">
            <Ticket className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <dt className="text-muted-foreground">{t("booking.activity")}</dt>
              <dd className="font-semibold">{props.activityTitle}</dd>
            </div>
          </div>
          <div className="flex gap-3">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <dt className="text-muted-foreground">{t("booking.when")}</dt>
              <dd className="font-semibold">
                {formatDate(props.startsAt, locale, props.timeZone)},{" "}
                {formatTimeRange(props.startsAt, props.endsAt, locale, props.timeZone)}{" "}
                <span className="font-normal text-muted-foreground">
                  ({timeZoneLabel(props.startsAt, locale, props.timeZone)})
                </span>
              </dd>
            </div>
          </div>
          <div className="flex gap-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <dt className="text-muted-foreground">{t("booking.where")}</dt>
              <dd className="font-semibold">{props.venueName}</dd>
              <dd className="text-muted-foreground">{props.venueAddress}</dd>
            </div>
          </div>
        </dl>
        {deadlinePassed ? (
          <Alert variant="warning" title={t("booking.noFreeCancellationTitle")}>
            {t("booking.noFreeCancellationText")}
          </Alert>
        ) : (
          <Alert
            variant="info"
            title={t("booking.freeCancellationUntil", {
              time: formatDateTime(deadline, locale, props.timeZone, { dateStyle: "medium", timeStyle: "short" }),
            })}
          >
            {t("booking.lateCancellationNote")}
          </Alert>
        )}
        <p className="text-sm text-muted-foreground">
          {t("booking.visitsAfter", { count: Math.max(props.visitsAvailable - 1, 0) })}
        </p>
        <FormError code={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={confirm} disabled={pending} aria-disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {pending ? t("booking.pending") : t("booking.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
