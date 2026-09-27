import { AlertTriangle, ClipboardCheck, Clock } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { AdminHeader } from "@/features/admin/admin-header";
import { getOperationalTotals } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth";
import { formatMoney, formatNumber } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { renderTimeMs } from "@/lib/server-time";
import { addDays, isDateString, localDateString, zonedTimeToUtc } from "@/lib/time";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "admin" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AdminOverviewPage({ params, searchParams }: PageProps<"/[locale]/admin">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdmin(locale, `/${locale}/admin`);
  const query = await searchParams;
  const today = localDateString(new Date(renderTimeMs()), DEFAULT_TIMEZONE);
  const to = typeof query.to === "string" && isDateString(query.to) ? query.to : today;
  const fromCandidate = typeof query.from === "string" && isDateString(query.from) ? query.from : addDays(to, -29);
  const from = fromCandidate > to ? to : fromCandidate;
  const totals = await getOperationalTotals(
    zonedTimeToUtc(from, "00:00", DEFAULT_TIMEZONE),
    zonedTimeToUtc(addDays(to, 1), "00:00", DEFAULT_TIMEZONE),
  );
  const t = await getTranslations();
  const money = (minor: number) => formatMoney(minor, locale, t("common.currency"));
  const n = (value: number) => formatNumber(value, locale);

  const groups = [
    {
      title: t("admin.totals.money"),
      items: [
        {
          label: t("admin.totals.collected"),
          value: money(totals.collected_minor),
          note: t("admin.totals.payments", { count: totals.collected_count }),
        },
        {
          label: t("admin.totals.refunded"),
          value: money(totals.refunded_minor),
          note: t("admin.totals.payments", { count: totals.refunded_count }),
        },
        { label: t("admin.totals.demo"), value: n(totals.demo_payments_count), note: t("admin.totals.demoNote") },
      ],
    },
    {
      title: t("admin.totals.memberships"),
      items: [
        { label: t("membership.source.payment"), value: n(totals.memberships_payment) },
        { label: t("admin.totals.demoMemberships"), value: n(totals.memberships_demo) },
        { label: t("admin.totals.adminMemberships"), value: n(totals.memberships_admin) },
      ],
    },
    {
      title: t("admin.totals.activity"),
      items: [
        { label: t("admin.totals.bookings"), value: n(totals.bookings_created) },
        { label: t("admin.totals.checkins"), value: n(totals.checkins) },
        { label: t("bookingState.no_show"), value: n(totals.no_shows) },
        { label: t("bookingState.cancelled_late"), value: n(totals.late_cancellations) },
        { label: t("bookingState.venue_cancelled"), value: n(totals.venue_cancellations) },
      ],
    },
  ];

  const attention = [
    {
      icon: ClipboardCheck,
      label: t("admin.attention.revisions", { count: totals.submitted_revisions }),
      href: "/admin/revisions",
      count: totals.submitted_revisions,
    },
    {
      icon: AlertTriangle,
      label: t("admin.attention.reconciliation", { count: totals.orders_needing_reconciliation }),
      href: "/admin/payments",
      count: totals.orders_needing_reconciliation,
    },
    {
      icon: Clock,
      label: t("admin.attention.pending", { count: totals.pending_orders }),
      href: "/admin/payments",
      count: totals.pending_orders,
    },
  ];

  return (
    <>
      <AdminHeader title={t("admin.title")} description={t("admin.description")} />
      <ul className="mb-6 grid gap-3 sm:grid-cols-3">
        {attention.map(({ icon: Icon, label, href, count }) => (
          <li key={label}>
            <Link
              href={href}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-sm font-medium hover:bg-muted ${count > 0 ? "border-warning/40 bg-warning-soft" : "border-border bg-card"}`}
            >
              <Icon className={`size-5 ${count > 0 ? "text-warning" : "text-muted-foreground"}`} aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1 font-medium">
          {t("partner.reports.from")}
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="h-10 rounded-lg border border-input bg-card px-3"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t("partner.reports.to")}
          <input type="date" name="to" defaultValue={to} className="h-10 rounded-lg border border-input bg-card px-3" />
        </label>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          {t("partner.reports.apply")}
        </button>
        <p className="w-full text-xs text-muted-foreground">{t("admin.totals.rangeNote")}</p>
      </form>
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.title} aria-labelledby={`g-${group.title}`}>
            <h2 id={`g-${group.title}`} className="mb-3 text-lg font-semibold">
              {group.title}
            </h2>
            <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {group.items.map((item) => (
                <div key={item.label} className="rounded-2xl border border-border bg-card p-4">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="text-2xl font-extrabold tracking-tight">{item.value}</dd>
                  {"note" in item && item.note ? <dd className="text-xs text-muted-foreground">{item.note}</dd> : null}
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}
