import { ArrowLeft, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { BookingStateBadge } from "@/features/booking/booking-state-badge";
import { partnerContext } from "@/features/partner/context";
import { getSessionWithRoster } from "@/features/partner/queries";
import { CancelSessionDialog, SessionCapacityForm } from "@/features/partner/session-controls";
import { formatDate, formatTime, formatTimeRange, timeZoneLabel } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import { renderTimeMs } from "@/lib/server-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/partner/sessions/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "partner.sessions" });
  return { title: t("rosterTitle"), robots: { index: false } };
}

export default async function SessionRosterPage({ params }: PageProps<"/[locale]/partner/sessions/[id]">) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  setRequestLocale(locale);
  if (!z.guid().safeParse(id).success) {
    notFound();
  }
  const { venues } = await partnerContext(locale, `/${locale}/partner/sessions/${id}`, undefined);
  const data = await getSessionWithRoster(id);
  const venue = data ? venues.find((v) => v.id === data.session.venue_id) : undefined;
  if (!data || !venue) {
    notFound();
  }
  const t = await getTranslations();
  const { session, roster } = data;
  const tz = venue.timezone;
  const now = renderTimeMs();
  const ended = new Date(session.ends_at).getTime() <= now;
  const isManager = venue.role === "manager";
  const booked = roster.filter((r) => r.booking_state === "confirmed" || r.booking_state === "checked_in").length;
  const date = formatDate(session.starts_at, locale, tz);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={{ pathname: "/partner/schedule", query: { venue: venue.id } }}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("partner.nav.schedule")}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{localized(session.activity.title, locale)}</h1>
        <p className="text-muted-foreground first-letter:uppercase">
          {date}, {formatTimeRange(session.starts_at, session.ends_at, locale, tz)} (
          {timeZoneLabel(session.starts_at, locale, tz)}) · {localized(venue.name, locale)}
        </p>
      </header>
      {session.status === "cancelled" ? (
        <Alert variant="warning" title={t("partner.sessionCancelled")}>
          {t("common.reason")}: {session.cancellation_reason}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Users className="size-5 text-primary" aria-hidden="true" />
              {t("partner.sessions.rosterTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {roster.length === 0 ? (
              <EmptyState title={t("partner.sessions.rosterEmpty")} className="py-6" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        {t("partner.sessions.member")}
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        {t("common.status")}
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        {t("partner.sessions.checkedInAt")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((row) => (
                      <tr key={row.booking_id} className="border-b border-border last:border-0">
                        <td className="py-2.5 pr-3 font-medium">
                          {row.member_display_name || t("partner.scanner.unnamed")}
                        </td>
                        <td className="py-2.5 pr-3">
                          <BookingStateBadge state={row.booking_state} sessionEnded={ended} />
                        </td>
                        <td className="py-2.5 tabular-nums">
                          {row.checked_in_at ? formatTime(row.checked_in_at, locale, tz) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("partner.sessions.detailsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <p>{t("partner.bookedOf", { booked, capacity: session.capacity })}</p>
            {isManager && session.status === "scheduled" && !ended ? (
              <>
                <SessionCapacityForm
                  sessionId={session.id}
                  capacity={session.capacity}
                  occupied={session.occupied_count}
                />
                <CancelSessionDialog sessionId={session.id} booked={booked} />
              </>
            ) : null}
            {ended ? <p className="text-muted-foreground">{t("partner.sessions.endedNote")}</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
