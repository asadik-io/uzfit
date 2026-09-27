"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { Checkbox, Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Locale } from "@/lib/i18n/routing";
import { localized, type LocalizedText } from "@/lib/localized";
import { createActivityAction, updateActivityAction } from "./actions";

export interface ActivityFormValues {
  id?: string;
  title: LocalizedText;
  description: LocalizedText;
  durationMinutes: number;
  defaultCapacity: number;
  isActive: boolean;
}

const LANGS = ["uz", "ru", "en"] as const;

/** Create (with kind and category) or edit an activity. Edits never move existing sessions. */
export function ActivityForm({
  venueId,
  categories,
  initial,
  onDone,
}: {
  venueId: string;
  categories: Array<{ id: string; name: LocalizedText }>;
  initial?: ActivityFormValues;
  onDone?: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const editing = Boolean(initial?.id);
  const [state, action] = useActionState(editing ? updateActivityAction : createActivityAction, null);
  const prefix = initial?.id ?? "new";

  useEffect(() => {
    if (state?.ok) {
      toast.success(t("partner.activities.saved"));
      onDone?.();
    }
  }, [state, t, onDone]);

  const invalid = (name: string) =>
    state && !state.ok && state.fieldErrors?.[name] ? t("partner.sessions.invalidField") : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="venueId" value={venueId} />
      {editing ? <input type="hidden" name="activityId" value={initial?.id} /> : null}
      <FormError code={state && !state.ok ? state.error : null} />
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium">{t("partner.activities.titleField")}</legend>
        {LANGS.map((lang) => (
          <Field
            key={lang}
            id={`${prefix}-title-${lang}`}
            label={t(`locales.${lang}`)}
            required={lang === "uz"}
            error={lang === "uz" ? invalid("title") : undefined}
          >
            <Input
              id={`${prefix}-title-${lang}`}
              name={`title.${lang}`}
              defaultValue={initial?.title[lang] ?? ""}
              maxLength={120}
              required={lang === "uz"}
            />
          </Field>
        ))}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium">{t("partner.activities.descriptionField")}</legend>
        {LANGS.map((lang) => (
          <Field key={lang} id={`${prefix}-description-${lang}`} label={t(`locales.${lang}`)}>
            <Textarea
              id={`${prefix}-description-${lang}`}
              name={`description.${lang}`}
              defaultValue={initial?.description[lang] ?? ""}
              maxLength={2000}
            />
          </Field>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        {!editing ? (
          <>
            <Field id={`${prefix}-kind`} label={t("partner.activities.kind")} required>
              <NativeSelect id={`${prefix}-kind`} name="kind" defaultValue="class">
                <option value="class">{t("venue.classKind")}</option>
                <option value="open_gym">{t("venue.openGymKind")}</option>
              </NativeSelect>
            </Field>
            <Field id={`${prefix}-category`} label={t("explore.category")} required error={invalid("categoryId")}>
              <NativeSelect id={`${prefix}-category`} name="categoryId">
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {localized(category.name, locale)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </>
        ) : null}
        <Field
          id={`${prefix}-duration`}
          label={t("partner.activities.duration")}
          required
          error={invalid("durationMinutes")}
        >
          <Input
            id={`${prefix}-duration`}
            name="durationMinutes"
            type="number"
            min={15}
            max={480}
            step={5}
            defaultValue={initial?.durationMinutes ?? 60}
            required
          />
        </Field>
        <Field
          id={`${prefix}-capacity`}
          label={t("partner.activities.defaultCapacity")}
          required
          error={invalid("defaultCapacity")}
        >
          <Input
            id={`${prefix}-capacity`}
            name="defaultCapacity"
            type="number"
            min={1}
            max={500}
            defaultValue={initial?.defaultCapacity ?? 12}
            required
          />
        </Field>
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <Checkbox id={`${prefix}-active`} name="isActive" defaultChecked={initial?.isActive ?? true} />
          <Label htmlFor={`${prefix}-active`}>{t("partner.activities.active")}</Label>
        </div>
      ) : null}
      {editing ? <p className="text-xs text-muted-foreground">{t("partner.activities.durationNote")}</p> : null}
      <div>
        <SubmitButton>{editing ? t("common.save") : t("partner.activities.create")}</SubmitButton>
      </div>
    </form>
  );
}
