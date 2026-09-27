"use client";

import { useLocale } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/ui/submit-button";
import { startCheckoutAction } from "./actions";

export function CheckoutForm({
  planVersionId,
  label,
  pendingLabel,
}: {
  planVersionId: string;
  label: string;
  pendingLabel: string;
}) {
  const locale = useLocale();
  const [state, action] = useActionState(startCheckoutAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="planVersionId" value={planVersionId} />
      <input type="hidden" name="locale" value={locale} />
      <FormError code={state && !state.ok ? state.error : null} />
      <SubmitButton size="lg" className="w-full" pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
    </form>
  );
}
