/**
 * Calendar helpers for IANA timezones. Dates are exchanged as "YYYY-MM-DD" strings so a local
 * calendar day never shifts with the server or browser timezone.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    return false;
  }
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Local calendar date of an instant in a timezone. */
export function localDateString(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return result.toISOString().slice(0, 10);
}

/** Offset of a timezone from UTC at an instant, in minutes (Asia/Tashkent: +300). */
export function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** Converts a wall-clock time in a timezone to the corresponding instant. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offset = timeZoneOffsetMinutes(guess, timeZone);
  const candidate = new Date(guess.getTime() - offset * 60_000);
  // Re-check once in case the offset differs at the candidate instant (DST transitions).
  const correction = timeZoneOffsetMinutes(candidate, timeZone);
  return correction === offset ? candidate : new Date(guess.getTime() - correction * 60_000);
}

/** Half-open UTC range [start, end) covering one local calendar day. */
export function localDayRange(date: string, timeZone: string): { start: Date; end: Date } {
  return { start: zonedTimeToUtc(date, "00:00", timeZone), end: zonedTimeToUtc(addDays(date, 1), "00:00", timeZone) };
}

/** ISO weekday (1 = Monday ... 7 = Sunday) of a date string. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}
