"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/ui/submit-button";
import { simulateDemoPaymentAction } from "./actions";

/** Buttons of the simulated provider page: approve or decline the demo payment. */
export function DemoPaymentForm({ orderId }: { orderId: string }) {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const [approveState, approve] = useActionState(simulateDemoPaymentAction, null);
  const [declineState, decline] = useActionState(simulateDemoPaymentAction, null);
  const error =
    (approveState && !approveState.ok ? approveState.error : null) ??
    (declineState && !declineState.ok ? declineState.error : null);
  return (
    <div className="flex flex-col gap-3">
      <FormError code={error} />
      <form action={approve}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="outcome" value="succeeded" />
        <input type="hidden" name="locale" value={locale} />
        <SubmitButton size="lg" className="w-full" pendingLabel={t("processing")}>
          {t("demoApprove")}
        </SubmitButton>
      </form>
      <form action={decline}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="outcome" value="failed" />
        <input type="hidden" name="locale" value={locale} />
        <SubmitButton variant="outline" className="w-full" pendingLabel={t("processing")}>
          {t("demoDecline")}
        </SubmitButton>
      </form>
    </div>
  );
}
