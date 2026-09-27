import { CalendarX, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatTimeRange } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import type { DaySession } from "./queries";

/** A day's sessions with operational counts; each row opens the roster. */
export async function DaySessionList({
  sessions,
  locale,
  timeZone,
  venueId,
  nowMs,
}: {
  sessions: DaySession[];
  locale: Locale;
  timeZone: string;
  venueId: string;
  nowMs: number;
}) {
  const t = await getTranslations("partner");
  if (sessions.length === 0) {
    return (
      <EmptyState icon={CalendarX} title={t("noSessionsTitle")} description={t("noSessionsText")} className="py-8" />
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {sessions.map((session) => {
        const booked = session.confirmed_count + session.checked_in_count;
        const cancelled = session.status === "cancelled";
        const ended = new Date(session.ends_at).getTime() <= nowMs;
        return (
          <li key={session.session_id}>
            <Link
              href={{ pathname: `/partner/sessions/${session.session_id}`, query: { venue: venueId } }}
              className="flex items-center gap-3 p-4 transition-colors hover:bg-muted"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="font-semibold tabular-nums">
                  {formatTimeRange(session.starts_at, session.ends_at, locale, timeZone)}
                  <span className="ml-2 font-medium">{localized(session.activity_title, locale)}</span>
                </p>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {cancelled ? (
                    <Badge variant="destructive">{t("sessionCancelled")}</Badge>
                  ) : (
                    <>
                      <span>{t("bookedOf", { booked, capacity: session.capacity })}</span>
                      <span>· {t("checkedInCount", { count: session.checked_in_count })}</span>
                      {session.no_show_count > 0 ? (
                        <span>· {t("noShowCount", { count: session.no_show_count })}</span>
                      ) : null}
                      {ended ? <Badge variant="secondary">{t("ended")}</Badge> : null}
                    </>
                  )}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
