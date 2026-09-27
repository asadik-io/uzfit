import { defineRouting } from "next-intl/routing";

export const locales = ["uz", "ru", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "uz";

/** All venue times are shown in the venue's timezone; this is the platform default. */
export const DEFAULT_TIMEZONE = "Asia/Tashkent";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  localeCookie: {
    name: "UZFIT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
});

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
