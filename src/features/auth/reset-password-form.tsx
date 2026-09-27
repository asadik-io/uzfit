"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormError } from "@/components/forms/form-error";
import { useFieldError } from "@/components/forms/use-field-error";
import { Button } from "@/components/ui/button";
import { Field, fieldAria, Input } from "@/components/ui/form-controls";
import type { DomainErrorCode } from "@/lib/errors";
import { clientPassword } from "@/lib/validation/client";
import { updatePasswordAction } from "./actions";

const schema = z
  .object({ password: clientPassword, confirm: z.string().min(1, "required") })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "passwordMismatch" });

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const fieldError = useFieldError();
  const [serverError, setServerError] = useState<DomainErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    const data = new FormData();
    data.set("password", values.password);
    data.set("confirm", values.confirm);
    data.set("locale", locale);
    startTransition(async () => {
      const result = await updatePasswordAction(null, data);
      if (result && !result.ok) {
        setServerError(result.error);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError code={serverError} />
      <Field
        id="password"
        label={t("newPassword")}
        hint={t("passwordHint")}
        error={fieldError(errors.password)}
        required
      >
        <Input
          {...fieldAria("password", errors.password, true)}
          type="password"
          autoComplete="new-password"
          {...form.register("password")}
        />
      </Field>
      <Field id="confirm" label={t("confirmPassword")} error={fieldError(errors.confirm)} required>
        <Input
          {...fieldAria("confirm", errors.confirm)}
          type="password"
          autoComplete="new-password"
          {...form.register("confirm")}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
        {pending ? t("reset.pending") : t("reset.submit")}
      </Button>
    </form>
  );
}
