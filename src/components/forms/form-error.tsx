"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import type { DomainErrorCode } from "@/lib/errors";

/** Translated server error for a form; announced to screen readers. */
export function FormError({ code }: { code: DomainErrorCode | null | undefined }) {
  const t = useTranslations("errors");
  if (!code) {
    return null;
  }
  return <Alert variant="destructive">{t(code)}</Alert>;
}
