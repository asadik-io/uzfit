import { CalendarRange, Clock, CreditCard, Hourglass, ListChecks, MapPinned } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { getMyMembership } from "@/features/discovery/queries";
import { getMembershipHistory, getPaymentHistory } from "@/features/membership/queries";
import { requireViewer } from "@/lib/auth";
import { formatDateTime, formatMoney, timeZoneLabel } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import { renderTimeMs } from "@/lib/server-time";
import type { Database } from "@/lib/supabase/database.types";

export async function generateMetadata({ params }: PageProps<"/[locale]/membership">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "membership" });
  return { title: t("title"), robots: { index: false } };
}

type OrderStatus = Database["public"]["Enums"]["order_status"];

const ORDER_VARIANTS: Record<OrderStatus, BadgeProps["variant"]> = {
  pending: "info",
  paid: "success",
  failed: "destructive",
  cancelled: "secondary",
  refunded: "warning",
};

export default async function MembershipPage({ params }: PageProps<"/[locale]/membership">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireViewer(locale, `/${locale}/membership`);
  const [membership, history, orders] = await Promise.all([
    getMyMembership(),
    getMembershipHistory(),
    getPaymentHistory(),
  ]);
  const t = await getTranslations();
  const tz = DEFAULT_TIMEZONE;
  const now = renderTimeMs();
  const at = (value: string) => formatDateTime(value, locale, tz, { dateStyle: "long", timeStyle: "short" });
  const short = (value: string) => formatDateTime(value, locale, tz, { dateStyle: "medium" });
  const pendingOrder = orders.find((o) => o.status === "pending" && new Date(o.expires_at).getTime() > now);

  return (
    <div className="container-page flex flex-col gap-8 pb-8">
      <PageHeader title={t("membership.title")} description={t("membership.description")} />

      {membership ? (
        <section aria-labelledby="current-heading" className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-emerald-800 via-primary to-emerald-600 p-6 text-primary-foreground lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="current-heading" className="text-2xl font-bold">
                {localized(membership.plan_name, locale)}
              </h2>
              {membership.is_demo ? (
                <Badge variant="demo" className="bg-white/90">
                  {t("demo.badge")}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-emerald-50">{t(`membership.source.${membership.source}`)}</p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-emerald-100">{t("membership.validUntil")}</dt>
                <dd className="text-lg font-semibold">
                  {at(membership.ends_at)}{" "}
                  <span className="text-sm font-normal text-emerald-100">
                    ({timeZoneLabel(membership.ends_at, locale, tz)})
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-emerald-100">{t("membership.started")}</dt>
                <dd className="text-lg font-semibold">{at(membership.starts_at)}</dd>
              </div>
            </dl>
            <p className="text-sm text-emerald-50">{t("membership.noRenewal")}</p>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button asChild variant="accent">
                <Link href={`/explore?plan=${membership.plan_code}`}>{t("bookings.findSession")}</Link>
              </Button>
              <Button asChild variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">
                <Link href="/bookings">{t("nav.bookings")}</Link>
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle as="h2">{t("membership.visitsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight">{membership.available}</span>
                <span className="text-muted-foreground">
                  {t("membership.availableOf", { total: membership.visit_allowance })}
                </span>
              </p>
              <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={t("membership.usageLabel", {
                  used: membership.consumed,
                  reserved: membership.reserved,
                  available: membership.available,
                })}
              >
                <div
                  className="h-full bg-foreground/70"
                  style={{ width: `${(membership.consumed / membership.visit_allowance) * 100}%` }}
                />
                <div
                  className="h-full bg-accent"
                  style={{ width: `${(membership.reserved / membership.visit_allowance) * 100}%` }}
                />
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 rounded-full bg-foreground/70" aria-hidden="true" />
                    {t("membership.used")}
                  </dt>
                  <dd className="font-semibold">{membership.consumed}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 rounded-full bg-accent" aria-hidden="true" />
                    {t("membership.reserved")}
                  </dt>
                  <dd className="font-semibold">{membership.reserved}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 rounded-full bg-muted ring-1 ring-border" aria-hidden="true" />
                    {t("membership.available")}
                  </dt>
                  <dd className="font-semibold">{membership.available}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">{t("membership.usageHint")}</p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle as="h2">{t("membership.rulesTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <li className="flex gap-2.5">
                  <CalendarRange className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {t("plans.dailyLimit", { count: membership.daily_visit_limit })}
                </li>
                <li className="flex gap-2.5">
                  <ListChecks className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {t("membership.upcomingOf", {
                    count: membership.upcoming_count,
                    max: membership.max_future_bookings,
                  })}
                </li>
                <li className="flex gap-2.5">
                  <Hourglass className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {t("plans.bookingWindow", {
                    days: t("common.days", { count: membership.booking_window_days }),
                  })}
                </li>
                <li className="flex gap-2.5">
                  <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {t("plans.freeCancellation", {
                    time:
                      membership.free_cancellation_minutes % 60 === 0
                        ? t("common.hours", { count: membership.free_cancellation_minutes / 60 })
                        : t("common.minutes", { count: membership.free_cancellation_minutes }),
                  })}
                </li>
                <li className="flex gap-2.5">
                  <MapPinned className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {t("plans.venuesIncluded", { count: membership.eligible_venue_count })}
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : (
        <div className="flex flex-col gap-4">
          {pendingOrder ? (
            <Alert variant="info" title={t("membership.pendingOrderTitle")}>
              {t("membership.pendingOrderText")}{" "}
              <Link href={`/checkout/return/${pendingOrder.id}`} className="font-semibold underline">
                {t("membership.pendingOrderLink")}
              </Link>
            </Alert>
          ) : null}
          <EmptyState
            icon={CreditCard}
            title={t("membership.emptyTitle")}
            description={t("membership.emptyText")}
            action={
              <Button asChild>
                <Link href="/plans">{t("membership.comparePlans")}</Link>
              </Button>
            }
          />
        </div>
      )}

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-xl font-semibold">
          {t("membership.historyTitle")}
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("membership.historyEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
            {history.map((item) => {
              const state =
                item.status === "revoked"
                  ? "revoked"
                  : new Date(item.ends_at).getTime() <= now
                    ? "expired"
                    : new Date(item.starts_at).getTime() > now
                      ? "scheduled"
                      : "active";
              const variant: BadgeProps["variant"] =
                state === "active" ? "success" : state === "revoked" ? "destructive" : "secondary";
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {localized(item.plan_version?.name, locale)}
                      {item.is_demo ? <Badge variant="demo">{t("demo.badge")}</Badge> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {short(item.starts_at)} – {short(item.ends_at)}
                    </p>
                  </div>
                  <Badge variant={variant}>{t(`membership.state.${state}`)}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="payments-heading" className="flex flex-col gap-3">
        <h2 id="payments-heading" className="text-xl font-semibold">
          {t("membership.paymentsTitle")}
        </h2>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("membership.paymentsEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/checkout/return/${order.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 transition-colors hover:bg-muted"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {localized(order.plan_version?.name, locale)}
                      {order.is_demo ? <Badge variant="demo">{t("demo.badge")}</Badge> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {short(order.created_at)} · {formatMoney(order.amount_minor, locale, t("common.currency"))}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {order.needs_reconciliation ? <Badge variant="warning">{t("membership.underReview")}</Badge> : null}
                    <Badge variant={ORDER_VARIANTS[order.status]}>{t(`orderStatus.${order.status}`)}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
