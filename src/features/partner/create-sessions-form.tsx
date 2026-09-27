"use client";

import { Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/form-controls";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Locale } from "@/lib/i18n/routing";
import { localized, type LocalizedText } from "@/lib/localized";
import { createSessionsAction } from "./actions";

export interface ActivityOption {
  id: string;
  title: LocalizedText;
  durationMinutes: number;
  defaultCapacity: number;
}

/** Creates one or more dated sessions; times are the venue's local wall-clock times. */
export function CreateSessionsForm({
  activities,
  defaultDate,
  minDate,
  timeZoneLabel,
}: {
  activities: ActivityOption[];
  defaultDate: string;
  minDate: string;
  timeZoneLabel: string;
}) {
  const t = useTranslations("partner.sessions");
  const locale = useLocale() as Locale;
  const [state, action] = useActionState(createSessionsAction, null);
  const [times, setTimes] = useState<string[]>(["09:00"]);
  const [activityId, setActivityId] = useState(activities[0]?.id ?? "");
  const activity = activities.find((a) => a.id === activityId);

  useEffect(() => {
    if (state?.ok) {
      toast.success(t("created", { count: state.data.count }));
    }
  }, [state, t]);

  const fieldError = (name: string) =>
    state && !state.ok && state.fieldErrors?.[name] ? t("invalidField") : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError code={state && !state.ok ? state.error : null} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="activityId" label={t("activity")} required error={fieldError("activityId")}>
          <NativeSelect
            id="activityId"
            name="activityId"
            value={activityId}
            onChange={(event) => setActivityId(event.target.value)}
          >
            {activities.map((option) => (
              <option key={option.id} value={option.id}>
                {localized(option.title, locale)} · {t("minutes", { count: option.durationMinutes })}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="date" label={t("date")} required error={fieldError("date")}>
          <Input id="date" name="date" type="date" defaultValue={defaultDate} min={minDate} required />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          {t("startTimes")} <span className="font-normal text-muted-foreground">({timeZoneLabel})</span>
        </legend>
        <ul className="flex flex-wrap gap-2">
          {times.map((value, index) => (
            <li key={index} className="flex items-center gap-1">
              <Input
                type="time"
                name="times"
                value={value}
                required
                aria-label={t("startTimeN", { n: index + 1 })}
                onChange={(event) =>
                  setTimes((list) => list.map((item, i) => (i === index ? event.target.value : item)))
                }
                className="w-32"
              />
              {times.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("removeTime")}
                  onClick={() => setTimes((list) => list.filter((_, i) => i !== index))}
                >
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {times.length < 12 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setTimes((l) => [...l, ""])}
          >
            <Plus aria-hidden="true" />
            {t("addTime")}
          </Button>
        ) : null}
        {fieldError("times") ? <p className="text-xs font-medium text-destructive">{t("timesInvalid")}</p> : null}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="repeatWeeks" label={t("repeatWeeks")} hint={t("repeatHint")}>
          <Input id="repeatWeeks" name="repeatWeeks" type="number" min={1} max={12} defaultValue={1} />
        </Field>
        <Field id="capacity" label={t("capacity")} hint={t("capacityHint")} error={fieldError("capacity")}>
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            max={500}
            placeholder={activity ? String(activity.defaultCapacity) : undefined}
          />
        </Field>
      </div>
      <div>
        <SubmitButton pendingLabel={t("creating")}>{t("create")}</SubmitButton>
      </div>
    </form>
  );
}
