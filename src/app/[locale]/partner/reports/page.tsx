import { Download } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { BookingStateBadge } from "@/features/booking/booking-state-badge";
import { partnerContext, venueToday } from "@/features/partner/context";
import { PartnerHeader } from "@/features/partner/partner-header";
import { getAttendanceReport, MAX_REPORT_DAYS, reportRange } from "@/features/partner/report";
import { formatDateTime, formatTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";

export async function generateMetadata({ params }: PageProps<"/[locale]/partner/reports">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "partner.nav" });
  return { title: t("reports"), robots: { index: false } };
}

const PREVIEW_ROWS = 100;

export default async function ReportsPage({ params, searchParams }: PageProps<"/[locale]/partner/reports">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const query = await searchParams;
  const { venues, venue } = await partnerContext(locale, `/${locale}/partner/reports`, query.venue);
  if (!venue) {
    redirect(`/${locale}/partner`);
  }
  if (venue.role !== "manager") {
    redirect(`/${locale}/partner?venue=${venue.id}`);
  }
  const t = await getTranslations();
  const range = reportRange(query.from, query.to, venueToday(venue));
  const rows = await getAttendanceReport(venue.id, range.from, range.to);
  const count = (state: string) => rows.filter((r) => r.booking_state === state).length;
  const summary = [
    { label: t("bookingState.checked_in"), value: count("checked_in") },
    { label: t("bookingState.no_show"), value: count("no_show") },
    { label: t("bookingState.cancelled_late"), value: count("cancelled_late") },
    { label: t("bookingState.venue_cancelled"), value: count("venue_cancelled") },
    { label: t("bookingState.confirmed"), value: count("confirmed") },
  ];
  const csvHref = `/api/partner/attendance?${new URLSearchParams({ venue: venue.id, from: range.from, to: range.to, locale })}`;

  return (
    <>
      <PartnerHeader
        title={t("partner.nav.reports")}
        description={t("partner.reports.description", { days: MAX_REPORT_DAYS })}
        venues={venues}
        venue={venue}
        locale={locale}
      />
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="venue" value={venue.id} />
        <label className="flex flex-col gap-1 font-medium">
          {t("partner.reports.from")}
          <input
            type="date"
            name="from"
            defaultValue={range.from}
            className="h-10 rounded-lg border border-input bg-card px-3"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t("partner.reports.to")}
          <input
            type="date"
            name="to"
            defaultValue={range.to}
            className="h-10 rounded-lg border border-input bg-card px-3"
          />
        </label>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          {t("partner.reports.apply")}
        </button>
        <a href={csvHref} className={buttonVariants()} download>
          <Download aria-hidden="true" />
          {t("partner.reports.download")}
        </a>
      </form>
      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {summary.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="text-2xl font-extrabold">{item.value}</dd>
          </div>
        ))}
      </dl>
      {rows.length === 0 ? (
        <EmptyState title={t("partner.reports.emptyTitle")} description={t("partner.reports.emptyText")} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">{t("partner.nav.reports")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="p-3 font-medium">
                  {t("partner.reports.colStart")}
                </th>
                <th scope="col" className="p-3 font-medium">
                  {t("partner.reports.colActivity")}
                </th>
                <th scope="col" className="p-3 font-medium">
                  {t("partner.reports.colMember")}
                </th>
                <th scope="col" className="p-3 font-medium">
                  {t("partner.reports.colStatus")}
                </th>
                <th scope="col" className="p-3 font-medium">
                  {t("partner.reports.colCheckedIn")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PREVIEW_ROWS).map((row) => (
                <tr key={row.booking_id} className="border-b border-border last:border-0">
                  <td className="p-3 whitespace-nowrap tabular-nums">
                    {formatDateTime(row.session_starts_at, locale, venue.timezone, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="p-3">{localized(row.activity_title, locale)}</td>
                  <td className="p-3">{row.member_display_name || t("partner.scanner.unnamed")}</td>
                  <td className="p-3">
                    <BookingStateBadge state={row.booking_state} />
                  </td>
                  <td className="p-3 tabular-nums">
                    {row.checked_in_at ? formatTime(row.checked_in_at, locale, venue.timezone) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > PREVIEW_ROWS ? (
            <p className="p-3 text-xs text-muted-foreground">
              {t("partner.reports.previewNote", { count: PREVIEW_ROWS })}
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
