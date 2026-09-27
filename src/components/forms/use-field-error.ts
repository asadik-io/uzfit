"use client";

import { useTranslations } from "next-intl";
import type { FieldError } from "react-hook-form";

type ValidationKey = keyof IntlMessages["validation"];

/** Client schemas use validation dictionary keys as messages; this translates them. */
export function useFieldError() {
  const t = useTranslations("validation");
  return (error: FieldError | undefined, values?: Record<string, string | number>): string | undefined => {
    if (!error?.message) {
      return undefined;
    }
    const key = error.message as ValidationKey;
    try {
      return t(key, values);
    } catch {
      return t("required");
    }
  };
}
