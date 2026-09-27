import type { Locale } from "@/lib/i18n/routing";

export type LocalizedText = Partial<Record<Locale, string>>;

function isLocalizedText(value: unknown): value is LocalizedText {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Picks the requested locale from a localized database field, falling back to Uzbek (the
 * required, default language), then to any non-empty translation.
 */
export function localized(value: unknown, locale: Locale): string {
  if (!isLocalizedText(value)) {
    return "";
  }
  const direct = value[locale]?.trim();
  if (direct) {
    return direct;
  }
  const uzbek = value.uz?.trim();
  if (uzbek) {
    return uzbek;
  }
  return Object.values(value).find((text) => typeof text === "string" && text.trim() !== "")?.trim() ?? "";
}
