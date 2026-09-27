"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
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
import { Checkbox, Label } from "@/components/ui/form-controls";
import type { DomainErrorCode } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useRouter } from "@/lib/i18n/navigation";
import { cancelBookingAction } from "./actions";

export interface CancelBookingDialogProps {
  bookingId: string;
  /** Free cancellation deadline (inclusive), ISO string. */
  deadline: string;
  timeZone: string;
  /** Database time when the page was rendered. */
  serverNow: string;
}

/**
 * Shows the cancellation consequence before submitting. After the free-cancellation deadline the
 * member must explicitly acknowledge that one visit will be used; the database enforces the same
 * rule with its own clock and answers LATE_CANCELLATION_UNCONFIRMED if the deadline passed while
 * the dialog was open.
 */
export function CancelBookingDialog({ bookingId, deadline, timeZone, serverNow }: CancelBookingDialogProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const skew = useRef(0);
  const [open, setOpen] = useState(false);
  const [late, setLate] = useState(() => new Date(serverNow) > new Date(deadline));
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<DomainErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    skew.current = new Date(serverNow).getTime() - Date.now();
  }, [serverNow]);

  const deadlineText = formatDateTime(deadline, locale, timeZone, { dateStyle: "medium", timeStyle: "short" });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setAcknowledged(false);
      setLate(Date.now() + skew.current > new Date(deadline).getTime());
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await cancelBookingAction(bookingId, late && acknowledged);
      if (!result.ok) {
        if (result.error === "LATE_CANCELLATION_UNCONFIRMED") {
          setLate(true);
          setAcknowledged(false);
        }
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success(result.data.state === "cancelled_late" ? t("cancel.doneLate") : t("cancel.done"));
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive-soft">
          {t("cancel.button")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("cancel.title")}</DialogTitle>
          <DialogDescription>{t("cancel.description")}</DialogDescription>
        </DialogHeader>
        {late ? (
          <Alert variant="warning" title={t("cancel.lateTitle")}>
            {t("cancel.lateText", { time: deadlineText })}
          </Alert>
        ) : (
          <Alert variant="success" title={t("cancel.freeTitle")}>
            {t("cancel.freeText", { time: deadlineText })}
          </Alert>
        )}
        {late ? (
          <div className="flex items-start gap-3">
            <Checkbox
              id={`ack-${bookingId}`}
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <Label htmlFor={`ack-${bookingId}`} className="font-normal">
              {t("cancel.acknowledge")}
            </Label>
          </div>
        ) : null}
        <FormError code={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {t("cancel.keep")}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending || (late && !acknowledged)}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {pending ? t("cancel.pending") : late ? t("cancel.confirmLate") : t("cancel.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
