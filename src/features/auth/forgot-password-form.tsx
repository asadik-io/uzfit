"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormError } from "@/components/forms/form-error";
import { useFieldError } from "@/components/forms/use-field-error";
import { Button } from "@/components/ui/button";
import { Field, fieldAria, Input } from "@/components/ui/form-controls";
import type { DomainErrorCode } from "@/lib/errors";
import { clientEmail } from "@/lib/validation/client";
import { requestPasswordResetAction } from "./actions";

const schema = z.object({ email: clientEmail });

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const fieldError = useFieldError();
  const [serverError, setServerError] = useState<DomainErrorCode | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    const data = new FormData();
    data.set("email", values.email);
    data.set("locale", locale);
    startTransition(async () => {
      const result = await requestPasswordResetAction(null, data);
      if (result.ok) {
        setSentTo(result.data.email);
      } else {
        setServerError(result.error);
      }
    });
  });

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <MailCheck className="size-7" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold">{t("forgot.sentTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("forgot.sent", { email: sentTo })}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError code={serverError} />
      <Field id="email" label={t("email")} error={fieldError(form.formState.errors.email)} required>
        <Input
          {...fieldAria("email", form.formState.errors.email)}
          type="email"
          autoComplete="email"
          inputMode="email"
          {...form.register("email")}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
        {pending ? t("forgot.pending") : t("forgot.submit")}
      </Button>
    </form>
  );
}
