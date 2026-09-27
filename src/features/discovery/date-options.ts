import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n/routing";
import { DEFAULT_TIMEZONE } from "@/lib/i18n/routing";
import { addDays, localDateString, zonedTimeToUtc } from "@/lib/time";

/** The next `count` local days starting today, labelled "Today", "Tomorrow", then "Wed, 30 Sep". */
export function upcomingDays(
  locale: Locale,
  labels: { today: string; tomorrow: string },
  count = 7,
  timeZone = DEFAULT_TIMEZONE,
  now = new Date(),
) {
  const today = localDateString(now, timeZone);
  return Array.from({ length: count }, (_, i) => {
    const value = addDays(today, i);
    const noon = zonedTimeToUtc(value, "12:00", timeZone);
    const label =
      i === 0
        ? labels.today
        : i === 1
          ? labels.tomorrow
          : formatDate(noon, locale, timeZone, { weekday: "short", day: "numeric", month: "short" });
    return {
      value,
      label,
      weekday: formatDate(noon, locale, timeZone, { weekday: "short" }),
      day: formatDate(noon, locale, timeZone, { day: "numeric" }),
    };
  });
}
