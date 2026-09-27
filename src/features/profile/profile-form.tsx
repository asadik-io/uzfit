"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FormError } from "@/components/forms/form-error";
import { useFieldError } from "@/components/forms/use-field-error";
import { Button } from "@/components/ui/button";
import { Field, fieldAria, Input, NativeSelect } from "@/components/ui/form-controls";
import type { DomainErrorCode } from "@/lib/errors";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { isLocale, type Locale, locales } from "@/lib/i18n/routing";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { clientDisplayName } from "@/lib/validation/client";
import { updateProfileAction } from "./actions";

const schema = z.object({
  displayName: clientDisplayName,
  phone: z
    .string()
    .trim()
    .max(32, "tooLong")
    .refine((value) => value === "" || normalizePhone(value) !== null, "phone"),
  locale: z.enum(locales, "required"),
});
type Values = z.infer<typeof schema>;

export function ProfileForm({ initial }: { initial: { displayName: string; phone: string; locale: Locale } }) {
  const t = useTranslations();
  const currentLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const fieldError = useFieldError();
  const [serverError, setServerError] = useState<DomainErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    const data = new FormData();
    data.set("displayName", values.displayName);
    data.set("phone", values.phone);
    data.set("locale", values.locale);
    startTransition(async () => {
      const result = await updateProfileAction(null, data);
      if (!result.ok) {
        setServerError(result.error);
        for (const field of Object.keys(result.fieldErrors ?? {})) {
          if (field === "displayName" || field === "phone" || field === "locale") {
            form.setError(field, { message: field === "phone" ? "phone" : "required" });
          }
        }
        return;
      }
      const e164 = values.phone.trim() === "" ? null : normalizePhone(values.phone);
      const normalized = e164 ? formatPhone(e164) : values.phone.trim();
      form.reset({ ...values, phone: normalized });
      toast.success(t("profile.saved"));
      if (values.locale !== currentLocale && isLocale(values.locale)) {
        router.replace(pathname, { locale: values.locale });
      } else {
        router.refresh();
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError code={serverError} />
      <Field id="displayName" label={t("auth.displayName")} error={fieldError(errors.displayName)} required>
        <Input
          {...fieldAria("displayName", errors.displayName)}
          autoComplete="name"
          maxLength={80}
          {...form.register("displayName")}
        />
      </Field>
      <Field
        id="phone"
        label={
          <>
            {t("profile.phone")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
          </>
        }
        hint={t("profile.phoneHint")}
        error={fieldError(errors.phone)}
      >
        <Input
          {...fieldAria("phone", errors.phone, true)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+998 90 123 45 67"
          maxLength={32}
          {...form.register("phone")}
        />
      </Field>
      <Field id="locale" label={t("profile.language")} error={fieldError(errors.locale)} required>
        <NativeSelect {...fieldAria("locale", errors.locale)} {...form.register("locale")}>
          {locales.map((code) => (
            <option key={code} value={code} lang={code}>
              {t(`locales.${code}`)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div>
        <Button type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
