import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { partnerContext, venueToday } from "@/features/partner/context";
import { CreateSessionsForm } from "@/features/partner/create-sessions-form";
import { DaySessionList } from "@/features/partner/day-session-list";
import { PartnerHeader } from "@/features/partner/partner-header";
import { getActivities, getDaySessions } from "@/features/partner/queries";
import { formatDate, timeZoneLabel } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { renderTimeMs } from "@/lib/server-time";
import { addDays, isDateString } from "@/lib/time";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/partner/schedule">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "partner.nav" });
  return { title: t("schedule"), robots: { index: false } };
}

export default async function SchedulePage({ params, searchParams }: PageProps<"/[locale]/partner/schedule">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const query = await searchParams;
  const { venues, venue } = await partnerContext(locale, `/${locale}/partner/schedule`, query.venue);
  if (!venue) {
    redirect(`/${locale}/partner`);
  }
  const t = await getTranslations();
  const today = venueToday(venue);
  const requested = typeof query.date === "string" && isDateString(query.date) ? query.date : today;
  const isManager = venue.role === "manager";
  const [sessions, activities] = await Promise.all([
    getDaySessions(venue.id, requested),
    isManager ? getActivities(venue.id) : Promise.resolve([]),
  ]);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 1));
  const label = (date: string, options: Intl.DateTimeFormatOptions) =>
    formatDate(`${date}T12:00:00Z`, locale, "UTC", options);
  const activeActivities = activities.filter((a) => a.is_active);

  return (
    <>
      <PartnerHeader title={t("partner.nav.schedule")} venues={venues} venue={venue} locale={locale} />
      <nav aria-label={t("venue.chooseDay")} className="-mx-4 mb-4 overflow-x-auto px-4 pb-1">
        <ul className="flex gap-2">
          {days.map((date) => {
            const active = date === requested;
            return (
              <li key={date} className="shrink-0">
                <Link
                  href={{ pathname: "/partner/schedule", query: { venue: venue.id, date } }}
                  aria-current={active ? "date" : undefined}
                  className={cn(
                    "flex min-h-14 min-w-16 flex-col items-center justify-center rounded-xl border px-3 text-sm",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary",
                  )}
                >
                  <span className="text-xs capitalize">{label(date, { weekday: "short" })}</span>
                  <span className="font-semibold">{label(date, { day: "numeric", month: "short" })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="venue" value={venue.id} />
        <label className="flex flex-col gap-1 font-medium">
          {t("partner.jumpToDate")}
          <input
            type="date"
            name="date"
            defaultValue={requested}
            className="h-10 rounded-lg border border-input bg-card px-3"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-lg border border-border bg-card px-4 font-semibold hover:bg-muted"
        >
          {t("common.continue")}
        </button>
      </form>
      <h2 className="mb-3 text-lg font-semibold first-letter:uppercase">
        {label(requested, { weekday: "long", day: "numeric", month: "long" })}
      </h2>
      <DaySessionList
        sessions={sessions}
        locale={locale}
        timeZone={venue.timezone}
        venueId={venue.id}
        nowMs={renderTimeMs()}
      />

      {isManager ? (
        <Card className="mt-6" id="add-sessions">
          <CardHeader>
            <CardTitle as="h2">{t("partner.addSessions")}</CardTitle>
          </CardHeader>
          <CardContent>
            {activeActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("partner.sessions.noActivities")}{" "}
                <Link
                  href={{ pathname: "/partner/activities", query: { venue: venue.id } }}
                  className="font-semibold text-primary underline"
                >
                  {t("partner.nav.activities")}
                </Link>
              </p>
            ) : (
              <CreateSessionsForm
                activities={activeActivities.map((a) => ({
                  id: a.id,
                  title: a.title as Record<string, string>,
                  durationMinutes: a.duration_minutes,
                  defaultCapacity: a.default_capacity,
                }))}
                defaultDate={requested < today ? today : requested}
                minDate={today}
                timeZoneLabel={timeZoneLabel(new Date(renderTimeMs()), locale, venue.timezone)}
              />
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
