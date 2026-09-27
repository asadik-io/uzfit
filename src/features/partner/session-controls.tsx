"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
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
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { SubmitButton } from "@/components/ui/submit-button";
import type { DomainErrorCode } from "@/lib/errors";
import { useRouter } from "@/lib/i18n/navigation";
import { cancelSessionAction, updateSessionCapacityAction } from "./actions";

/** Capacity can grow freely; the database refuses values below the places already taken. */
export function SessionCapacityForm({
  sessionId,
  capacity,
  occupied,
}: {
  sessionId: string;
  capacity: number;
  occupied: number;
}) {
  const t = useTranslations("partner.sessions");
  const [state, action] = useActionState(updateSessionCapacityAction, null);
  useEffect(() => {
    if (state?.ok) {
      toast.success(t("capacitySaved"));
    }
  }, [state, t]);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Field id="capacity" label={t("capacity")} hint={t("capacityMin", { count: occupied })}>
        <div className="flex gap-2">
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={Math.max(occupied, 1)}
            max={500}
            defaultValue={capacity}
            className="w-28"
          />
          <SubmitButton variant="outline">{t("saveCapacity")}</SubmitButton>
        </div>
      </Field>
      <FormError code={state && !state.ok ? state.error : null} />
    </form>
  );
}

/** Venue cancellation with a recorded reason; affected members are notified and keep their visit. */
export function CancelSessionDialog({ sessionId, booked }: { sessionId: string; booked: number }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<DomainErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await cancelSessionAction(sessionId, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success(t("partner.sessions.cancelled", { count: result.data.released }));
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive-soft">
          {t("partner.sessions.cancelSession")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("partner.sessions.cancelTitle")}</DialogTitle>
          <DialogDescription>{t("partner.sessions.cancelText", { count: booked })}</DialogDescription>
        </DialogHeader>
        <Field id="cancel-reason" label={t("common.reason")} hint={t("partner.sessions.reasonHint")} required>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            required
          />
        </Field>
        <FormError code={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {t("partner.sessions.keepSession")}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending || reason.trim().length < 3}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t("partner.sessions.confirmCancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
