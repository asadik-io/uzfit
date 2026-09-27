import { CircleAlert, CircleCheck, CircleX, Clock, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMembershipForOrder, getMyOrder } from "@/features/checkout/queries";
import { requireViewer } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/checkout/return/[orderId]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "checkout" });
  return { title: t("returnTitle"), robots: { index: false } };
}

/**
 * Where the provider sends the member back. It only reports the order state stored by the
 * server; the redirect itself never activates anything.
 */
export default async function CheckoutReturnPage({ params }: PageProps<"/[locale]/checkout/return/[orderId]">) {
  const { locale, orderId } = (await params) as { locale: Locale; orderId: string };
  setRequestLocale(locale);
  if (!z.guid().safeParse(orderId).success) {
    notFound();
  }
  await requireViewer(locale, `/${locale}/checkout/return/${orderId}`);
  const [order, membership] = await Promise.all([getMyOrder(orderId), getMembershipForOrder(orderId)]);
  if (!order) {
    notFound();
  }
  const t = await getTranslations();
  const tz = DEFAULT_TIMEZONE;
  const at = (value: string) => formatDateTime(value, locale, tz, { dateStyle: "long", timeStyle: "short" });
  const planName = localized(order.plan_version?.name, locale);

  let tone: "success" | "warning" | "destructive" | "info";
  let Icon = Clock;
  let title: string;
  let text: string;
  if (order.status === "paid" && membership) {
    tone = "success";
    Icon = CircleCheck;
    title = t("checkout.paidTitle");
    text = t("checkout.paidText", { plan: planName, date: at(membership.ends_at) });
  } else if (order.status === "paid") {
    tone = "warning";
    Icon = CircleAlert;
    title = t("checkout.reviewTitle");
    text = t("checkout.reviewText");
  } else if (order.status === "failed") {
    tone = "destructive";
    Icon = CircleX;
    title = t("checkout.failedTitle");
    text = t("checkout.failedText");
  } else if (order.status === "cancelled") {
    tone = "info";
    Icon = CircleX;
    title = t("checkout.cancelledTitle");
    text = t("checkout.cancelledText");
  } else if (order.status === "refunded") {
    tone = "info";
    Icon = RotateCcw;
    title = t("checkout.refundedTitle");
    text = t("checkout.refundedText");
  } else {
    tone = "info";
    title = t("checkout.pendingTitle");
    text = t("checkout.pendingText");
  }

  const toneClass = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    destructive: "bg-destructive-soft text-destructive",
    info: "bg-info-soft text-info",
  }[tone];

  return (
    <div className="container-page flex max-w-lg flex-col gap-5 py-8">
      {order.status === "pending" ? <AutoRefresh /> : null}
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <span className={cn("flex size-16 items-center justify-center rounded-full", toneClass)}>
          <Icon className="size-8" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{text}</p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("checkout.plan")}</dt>
              <dd className="flex items-center gap-2 font-semibold">
                {planName}
                {order.is_demo ? <Badge variant="demo">{t("demo.badge")}</Badge> : null}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("checkout.amount")}</dt>
              <dd className="font-semibold">{formatMoney(order.amount_minor, locale, t("common.currency"))}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("checkout.createdAt")}</dt>
              <dd>{at(order.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("checkout.reference")}</dt>
              <dd className="font-mono text-xs">{order.id.slice(0, 8).toUpperCase()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        {order.status === "paid" && membership ? (
          <>
            <Button asChild size="lg">
              <Link href="/explore">{t("bookings.findSession")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/membership">{t("nav.membership")}</Link>
            </Button>
          </>
        ) : order.status === "pending" && order.provider === "demo" ? (
          <Button asChild variant="outline">
            <Link href={`/checkout/demo/${order.id}`}>{t("checkout.backToDemo")}</Link>
          </Button>
        ) : order.status === "failed" || order.status === "cancelled" ? (
          <Button asChild>
            <Link href={`/checkout/${order.plan_version_id}`}>{t("checkout.tryAgain")}</Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/membership">{t("nav.membership")}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
