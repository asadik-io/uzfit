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
import { Link } from "@/lib/i18n/navigation";
import { clientEmail } from "@/lib/validation/client";
import { signInAction } from "./actions";

const schema = z.object({ email: clientEmail, password: z.string().min(1, "required") });
type Values = z.infer<typeof schema>;

export function LoginForm({ next, initialError }: { next?: string; initialError?: DomainErrorCode | null }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const fieldError = useFieldError();
  const [serverError, setServerError] = useState<DomainErrorCode | null>(initialError ?? null);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    const data = new FormData();
    data.set("email", values.email);
    data.set("password", values.password);
    data.set("locale", locale);
    data.set("next", next ?? "");
    startTransition(async () => {
      const result = await signInAction(null, data);
      if (result && !result.ok) {
        setServerError(result.error);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError code={serverError} />
      <Field id="email" label={t("email")} error={fieldError(errors.email)} required>
        <Input
          {...fieldAria("email", errors.email)}
          type="email"
          autoComplete="email"
          inputMode="email"
          {...form.register("email")}
        />
      </Field>
      <Field id="password" label={t("password")} error={fieldError(errors.password)} required>
        <Input
          {...fieldAria("password", errors.password)}
          type="password"
          autoComplete="current-password"
          {...form.register("password")}
        />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          {t("login.forgot")}
        </Link>
      </div>
      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
        {pending ? t("login.pending") : t("login.submit")}
      </Button>
    </form>
  );
}
