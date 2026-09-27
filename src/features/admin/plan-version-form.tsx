"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { Checkbox, Field, Input, Label, Textarea } from "@/components/ui/form-controls";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/errors";
import { useRouter } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized, type LocalizedText } from "@/lib/localized";
import { createPlanVersionAction } from "./actions";

export interface PlanTermsDefaults {
  name: LocalizedText;
  description: LocalizedText;
  priceSom: number;
  durationDays: number;
  visitAllowance: number;
  dailyVisitLimit: number;
  maxFutureBookings: number;
  bookingWindowDays: number;
  freeCancellationMinutes: number;
  isDemo: boolean;
  venueIds: string[];
}

const LANGS = ["uz", "ru", "en"] as const;

/** Creates a new draft version; published versions are never edited in place. */
export function PlanVersionForm({
  planId,
  defaults,
  venues,
}: {
  planId: string;
  defaults: PlanTermsDefaults;
  venues: Array<{ id: string; name: LocalizedText; published: boolean }>;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [state, action] = useActionState(createPlanVersionAction, null);
  const handled = useRef<ActionResult | null>(null);

  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      toast.success(t("admin.plans.draftCreated"));
      router.refresh();
    }
  }, [state, t, router]);

  const invalid = (name: string) =>
    state && !state.ok && state.fieldErrors?.[name] ? t("admin.invalidField") : undefined;
  const number = (name: keyof PlanTermsDefaults, label: string, min: number, max: number, hint?: string) => (
    <Field id={`${planId}-${name}`} label={label} hint={hint} required error={invalid(name)}>
      <Input
        id={`${planId}-${name}`}
        name={name}
        type="number"
        min={min}
        max={max}
        defaultValue={String(defaults[name])}
        required
      />
    </Field>
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="planId" value={planId} />
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium">{t("admin.plans.name")}</legend>
        {LANGS.map((lang) => (
          <Field
            key={lang}
            id={`${planId}-name-${lang}`}
            label={t(`locales.${lang}`)}
            required={lang === "uz"}
            error={lang === "uz" ? invalid("nameUz") : undefined}
          >
            <Input
              id={`${planId}-name-${lang}`}
              name={`name.${lang}`}
              defaultValue={defaults.name[lang] ?? ""}
              maxLength={120}
              required={lang === "uz"}
            />
          </Field>
        ))}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium">{t("admin.plans.descriptionField")}</legend>
        {LANGS.map((lang) => (
          <Field key={lang} id={`${planId}-description-${lang}`} label={t(`locales.${lang}`)}>
            <Textarea
              id={`${planId}-description-${lang}`}
              name={`description.${lang}`}
              defaultValue={defaults.description[lang] ?? ""}
              maxLength={1000}
            />
          </Field>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {number("priceSom", t("admin.plans.priceSom"), 0, 100_000_000, t("admin.plans.priceHint"))}
        {number("durationDays", t("admin.plans.durationDays"), 1, 366)}
        {number("visitAllowance", t("admin.plans.visitAllowance"), 1, 1000)}
        {number("dailyVisitLimit", t("admin.plans.dailyVisitLimit"), 1, 10)}
        {number("maxFutureBookings", t("admin.plans.maxFutureBookings"), 1, 50)}
        {number("bookingWindowDays", t("admin.plans.bookingWindowDays"), 1, 60)}
        {number("freeCancellationMinutes", t("admin.plans.freeCancellationMinutes"), 0, 10080)}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id={`${planId}-isDemo`} name="isDemo" defaultChecked={defaults.isDemo} />
        <Label htmlFor={`${planId}-isDemo`} className="font-normal">
          {t("admin.plans.isDemo")}
        </Label>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          {t("admin.plans.venues")}
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        </legend>
        <ul className="grid gap-2 sm:grid-cols-2">
          {venues.map((venue) => (
            <li key={venue.id} className="flex items-center gap-2">
              <Checkbox
                id={`${planId}-venue-${venue.id}`}
                name="venueIds"
                value={venue.id}
                defaultChecked={defaults.venueIds.includes(venue.id)}
              />
              <Label htmlFor={`${planId}-venue-${venue.id}`} className="font-normal">
                {localized(venue.name, locale)}
                {!venue.published ? (
                  <span className="ml-1 text-xs text-muted-foreground">({t("admin.plans.notPublic")})</span>
                ) : null}
              </Label>
            </li>
          ))}
        </ul>
        {invalid("venueIds") ? (
          <p className="mt-1 text-xs font-medium text-destructive">{t("admin.plans.venuesRequired")}</p>
        ) : null}
      </fieldset>
      <FormError code={state && !state.ok ? state.error : null} />
      <div>
        <SubmitButton>{t("admin.plans.createDraft")}</SubmitButton>
      </div>
    </form>
  );
}
