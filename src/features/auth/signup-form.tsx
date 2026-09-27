"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormError } from "@/components/forms/form-error";
import { useFieldError } from "@/components/forms/use-field-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldAria, Input } from "@/components/ui/form-controls";
import type { DomainErrorCode } from "@/lib/errors";
import { clientDisplayName, clientEmail, clientPassword } from "@/lib/validation/client";
import { signUpAction } from "./actions";

const schema = z.object({ displayName: clientDisplayName, email: clientEmail, password: clientPassword });
type Values = z.infer<typeof schema>;

export function SignupForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const fieldError = useFieldError();
  const [serverError, setServerError] = useState<DomainErrorCode | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", email: "", password: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    const data = new FormData();
    data.set("displayName", values.displayName);
    data.set("email", values.email);
    data.set("password", values.password);
    data.set("locale", locale);
    data.set("next", next ?? "");
    startTransition(async () => {
      const result = await signUpAction(null, data);
      if (!result) {
        return;
      }
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
        <h2 className="text-lg font-semibold">{t("signup.checkEmailTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("signup.checkEmail", { email: sentTo })}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError code={serverError} />
      <Field id="displayName" label={t("displayName")} error={fieldError(errors.displayName)} required>
        <Input {...fieldAria("displayName", errors.displayName)} autoComplete="name" {...form.register("displayName")} />
      </Field>
      <Field id="email" label={t("email")} error={fieldError(errors.email)} required>
        <Input
          {...fieldAria("email", errors.email)}
          type="email"
          autoComplete="email"
          inputMode="email"
          {...form.register("email")}
        />
      </Field>
      <Field
        id="password"
        label={t("password")}
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
      <Alert variant="info">{t("signup.terms")}</Alert>
      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
        {pending ? t("signup.pending") : t("signup.submit")}
      </Button>
    </form>
  );
}
