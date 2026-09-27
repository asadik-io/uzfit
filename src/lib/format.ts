import type { Locale } from "@/lib/i18n/routing";

/** Money is stored in integer minor units (tiyin; 100 tiyin = 1 so'm). */
export function minorToMajor(minor: number): number {
  return minor / 100;
}

/**
 * Formats UZS amounts with locale-aware grouping and a localized currency label
 * (ICU has no localized UZS symbol for Russian, so the label comes from the dictionary).
 */
export function formatMoney(minor: number, locale: Locale, currencyLabel: string): string {
  const hasFraction = minor % 100 !== 0;
  const number = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(minorToMajor(minor));
  return `${number} ${currencyLabel}`;
}

export function intlLocale(locale: Locale): string {
  return locale === "uz" ? "uz-Latn-UZ" : locale === "ru" ? "ru-RU" : "en-GB";
}

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateTime(
  value: DateInput,
  locale: Locale,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone, ...options }).format(toDate(value));
}

export function formatTime(value: DateInput, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    toDate(value),
  );
}

export function formatDate(
  value: DateInput,
  locale: Locale,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" },
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone, ...options }).format(toDate(value));
}

/** "18:00–19:00" in the venue timezone. */
export function formatTimeRange(start: DateInput, end: DateInput, locale: Locale, timeZone: string): string {
  return `${formatTime(start, locale, timeZone)}–${formatTime(end, locale, timeZone)}`;
}

/** Short timezone label such as "GMT+5", shown where a time could be ambiguous. */
export function timeZoneLabel(value: DateInput, locale: Locale, timeZone: string): string {
  const parts = new Intl.DateTimeFormat(intlLocale(locale), { timeZone, timeZoneName: "short" }).formatToParts(
    toDate(value),
  );
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}
