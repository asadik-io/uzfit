import { CalendarDays, CalendarPlus, ScanLine, Store } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { partnerContext, venueToday } from "@/features/partner/context";
import { DaySessionList } from "@/features/partner/day-session-list";
import { PartnerHeader } from "@/features/partner/partner-header";
import { getDaySessions } from "@/features/partner/queries";
import { formatDate } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { renderTimeMs } from "@/lib/server-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/partner">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "partner" });
  return { title: t("title"), robots: { index: false } };
}

export default async function PartnerOverviewPage({ params, searchParams }: PageProps<"/[locale]/partner">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const query = await searchParams;
  const { venues, venue, managerOrgs } = await partnerContext(locale, `/${locale}/partner`, query.venue);
  const t = await getTranslations();

  if (!venue) {
    return (
      <>
        <PartnerHeader title={t("partner.title")} venues={venues} venue={null} locale={locale} />
        <EmptyState
          icon={Store}
          title={t("partner.noVenuesTitle")}
          description={managerOrgs.length > 0 ? t("partner.noVenuesManager") : t("partner.noVenuesStaff")}
          action={
            managerOrgs.length > 0 ? (
              <Button asChild>
                <Link href="/partner/venues/new">{t("partner.newVenue")}</Link>
              </Button>
            ) : null
          }
        />
      </>
    );
  }

  const today = venueToday(venue);
  const sessions = await getDaySessions(venue.id, today);
  const live = sessions.filter((s) => s.status === "scheduled");
  const stats = [
    { label: t("partner.stats.sessions"), value: live.length },
    {
      label: t("partner.stats.reservations"),
      value: live.reduce((n, s) => n + s.confirmed_count + s.checked_in_count, 0),
    },
    { label: t("partner.stats.checkedIn"), value: live.reduce((n, s) => n + s.checked_in_count, 0) },
    { label: t("partner.stats.noShows"), value: live.reduce((n, s) => n + s.no_show_count, 0) },
  ];
  const isManager = venue.role === "manager";

  return (
    <>
      <PartnerHeader
        title={t("partner.title")}
        venues={venues}
        venue={venue}
        locale={locale}
        actions={
          <Button asChild size="lg">
            <Link href={{ pathname: "/partner/scanner", query: { venue: venue.id } }}>
              <ScanLine aria-hidden="true" />
              {t("partner.openScanner")}
            </Link>
          </Button>
        }
      />
      <section aria-labelledby="today-heading" className="flex flex-col gap-4">
        <h2 id="today-heading" className="text-lg font-semibold first-letter:uppercase">
          {t("partner.today", { date: formatDate(`${today}T12:00:00Z`, locale, "UTC") })}
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border bg-card p-4">
              <dt className="text-sm text-muted-foreground">{stat.label}</dt>
              <dd className="text-3xl font-extrabold tracking-tight">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={{ pathname: "/partner/schedule", query: { venue: venue.id } }}>
              <CalendarDays aria-hidden="true" />
              {t("partner.nav.schedule")}
            </Link>
          </Button>
          {isManager ? (
            <Button asChild variant="outline">
              <Link href={{ pathname: "/partner/schedule", query: { venue: venue.id, add: "1" } }}>
                <CalendarPlus aria-hidden="true" />
                {t("partner.addSessions")}
              </Link>
            </Button>
          ) : null}
        </div>
        <DaySessionList
          sessions={sessions}
          locale={locale}
          timeZone={venue.timezone}
          venueId={venue.id}
          nowMs={renderTimeMs()}
        />
      </section>
    </>
  );
}
