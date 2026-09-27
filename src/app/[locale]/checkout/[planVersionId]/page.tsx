import { ArrowLeft, CalendarRange, Clock, Hourglass, ListChecks, MapPinned, Ticket } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckoutForm } from "@/features/checkout/checkout-form";
import { getCheckoutPlan } from "@/features/checkout/queries";
import { getMyMembership } from "@/features/discovery/queries";
import { requireViewer } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import { checkoutAdapter } from "@/lib/payments";
import { hasAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata({ params }: PageProps<"/[locale]/checkout/[planVersionId]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "checkout" });
  return { title: t("title"), robots: { index: false } };
}

export default async function CheckoutPage({ params }: PageProps<"/[locale]/checkout/[planVersionId]">) {
  const { locale, planVersionId } = (await params) as { locale: Locale; planVersionId: string };
  setRequestLocale(locale);
  if (!z.guid().safeParse(planVersionId).success) {
    notFound();
  }
  await requireViewer(locale, `/${locale}/checkout/${planVersionId}`);
  const [plan, membership] = await Promise.all([getCheckoutPlan(planVersionId), getMyMembership()]);
  const t = await getTranslations();
  if (!plan) {
    notFound();
  }
  const adapter = hasAdminClient() ? checkoutAdapter() : null;
  const hours = plan.free_cancellation_minutes / 60;
  const cancellation = Number.isInteger(hours)
    ? t("common.hours", { count: hours })
    : t("common.minutes", { count: plan.free_cancellation_minutes });
  const rules = [
    {
      icon: Ticket,
      text: t("plans.visitAllowance", {
        visits: t("common.visits", { count: plan.visit_allowance }),
        days: t("common.days", { count: plan.duration_days }),
      }),
    },
    { icon: CalendarRange, text: t("plans.dailyLimit", { count: plan.daily_visit_limit }) },
    { icon: ListChecks, text: t("plans.futureBookings", { count: plan.max_future_bookings }) },
    {
      icon: Hourglass,
      text: t("plans.bookingWindow", { days: t("common.days", { count: plan.booking_window_days }) }),
    },
    { icon: Clock, text: t("plans.freeCancellation", { time: cancellation }) },
    { icon: MapPinned, text: t("plans.venuesIncluded", { count: plan.venues.length }) },
  ];

  return (
    <div className="container-page flex max-w-3xl flex-col gap-5 py-6">
      <Link
        href="/plans"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("nav.plans")}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("checkout.title")}</h1>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle as="h2" className="text-xl">
              {localized(plan.name, locale)}
            </CardTitle>
            {plan.is_demo ? <Badge variant="demo">{t("demo.badge")}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">{localized(plan.description, locale)}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-extrabold tracking-tight">
              {formatMoney(plan.price_minor, locale, t("common.currency"))}
            </span>
            <span className="text-sm text-muted-foreground">/ {t("common.days", { count: plan.duration_days })}</span>
          </p>
          <ul className="grid gap-2.5 text-sm sm:grid-cols-2">
            {rules.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
          <p className="rounded-xl bg-muted p-3 text-sm">
            {t("checkout.termNote", { days: t("common.days", { count: plan.duration_days }) })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("checkout.paymentTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {membership ? (
            <>
              <Alert variant="info" title={t("errors.MEMBERSHIP_ALREADY_ACTIVE")}>
                {t("plans.activeText", {
                  date: formatDateTime(membership.ends_at, locale, DEFAULT_TIMEZONE, {
                    dateStyle: "long",
                    timeStyle: "short",
                  }),
                })}
              </Alert>
              <Button asChild variant="outline" className="w-fit">
                <Link href="/membership">{t("nav.membership")}</Link>
              </Button>
            </>
          ) : !adapter ? (
            <Alert variant="warning" title={t("checkout.unavailableTitle")}>
              {t("errors.PAYMENT_UNAVAILABLE")}
            </Alert>
          ) : (
            <>
              {adapter.isDemo ? (
                <Alert variant="warning" title={t("checkout.demoTitle")}>
                  {t("checkout.demoText")}
                </Alert>
              ) : null}
              <p className="flex items-center justify-between gap-3 border-t border-border pt-4 text-base">
                <span>{t("checkout.total")}</span>
                <span className="font-bold">{formatMoney(plan.price_minor, locale, t("common.currency"))}</span>
              </p>
              <CheckoutForm
                planVersionId={plan.id}
                label={adapter.isDemo ? t("checkout.continueDemo") : t("checkout.continue")}
                pendingLabel={t("checkout.preparing")}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
