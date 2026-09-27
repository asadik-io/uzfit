import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoPaymentForm } from "@/features/checkout/demo-payment-form";
import { getMyOrder } from "@/features/checkout/queries";
import { requireViewer } from "@/lib/auth";
import { demoPaymentsAllowed } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";

export async function generateMetadata({ params }: PageProps<"/[locale]/checkout/demo/[orderId]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "checkout" });
  return { title: t("demoProviderTitle"), robots: { index: false } };
}

/**
 * Stand-in for a payment provider's hosted page, available only when demo payments are allowed.
 * It never asks for card details.
 */
export default async function DemoProviderPage({ params }: PageProps<"/[locale]/checkout/demo/[orderId]">) {
  const { locale, orderId } = (await params) as { locale: Locale; orderId: string };
  setRequestLocale(locale);
  if (!demoPaymentsAllowed() || !z.guid().safeParse(orderId).success) {
    notFound();
  }
  await requireViewer(locale, `/${locale}/checkout/demo/${orderId}`);
  const order = await getMyOrder(orderId);
  if (!order || order.provider !== "demo") {
    notFound();
  }
  if (order.status !== "pending") {
    redirect(`/${locale}/checkout/return/${order.id}`);
  }
  const t = await getTranslations();

  return (
    <div className="container-page flex max-w-lg flex-col gap-5 py-8">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-warning/50 bg-warning-soft p-5 text-center">
        <FlaskConical className="size-8 text-warning" aria-hidden="true" />
        <h1 className="text-xl font-bold">{t("checkout.demoProviderTitle")}</h1>
        <p className="text-sm">{t("checkout.demoProviderText")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{localized(order.plan_version?.name, locale)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("checkout.amount")}</dt>
              <dd className="font-bold">{formatMoney(order.amount_minor, locale, t("common.currency"))}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("checkout.reference")}</dt>
              <dd className="font-mono text-xs">{order.id.slice(0, 8).toUpperCase()}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("checkout.expiresAt")}</dt>
              <dd>{formatDateTime(order.expires_at, locale, DEFAULT_TIMEZONE, { timeStyle: "short" })}</dd>
            </div>
          </dl>
          <DemoPaymentForm orderId={order.id} />
          <Link href="/plans" className="text-center text-sm font-medium text-muted-foreground hover:underline">
            {t("checkout.abandon")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
