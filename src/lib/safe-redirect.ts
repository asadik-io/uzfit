import { defaultLocale, isLocale, type Locale } from "@/lib/i18n/routing";

const INTERNAL_BASE = "http://internal.invalid";

/**
 * Accepts only same-site relative paths ("/uz/plans?x=1"). Rejects absolute URLs, protocol-relative
 * URLs ("//evil.test"), backslash tricks, control characters, and anything that resolves to
 * another origin.
 */
export function safeInternalPath(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) {
    return fallback;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }
  try {
    const url = new URL(value, INTERNAL_BASE);
    if (url.origin !== INTERNAL_BASE) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Resolves a redirect target that may be an absolute URL on the app's own origin (as used in
 * Supabase email links) or a relative path. Anything else falls back.
 */
export function safeRedirectTarget(value: unknown, appOrigin: string, fallback: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }
  if (value.startsWith("/")) {
    return safeInternalPath(value, fallback);
  }
  try {
    const url = new URL(value);
    if (url.origin !== new URL(appOrigin).origin) {
      return fallback;
    }
    return safeInternalPath(`${url.pathname}${url.search}${url.hash}`, fallback);
  } catch {
    return fallback;
  }
}

/** Locale of a locale-prefixed path ("/ru/bookings" -> "ru"). */
export function localeFromPath(path: string): Locale {
  const segment = path.split("/")[1];
  return isLocale(segment) ? segment : defaultLocale;
}

/** A safe internal path that is also locale-prefixed (every app page is); otherwise the fallback. */
export function safeLocalePath(value: unknown, fallback: string): string {
  const path = safeInternalPath(value, fallback);
  return /^\/(uz|ru|en)(\/|\?|#|$)/.test(path) ? path : fallback;
}
