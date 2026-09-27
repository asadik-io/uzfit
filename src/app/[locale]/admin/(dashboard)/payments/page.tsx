import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { ActionDialog } from "@/features/admin/action-form";
import { recordRefundAction, resolveReconciliationAction } from "@/features/admin/actions";
import { AdminHeader } from "@/features/admin/admin-header";
import { listOrders, listPaymentEvents, type OrderFilter } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/payments">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "admin.nav" });
  return { title: t("payments"), robots: { index: false } };
}

export default async function AdminPaymentsPage({ params, searchParams }: PageProps<"/[locale]/admin/payments">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdmin(locale, `/${locale}/admin/payments`);
  const query = await searchParams;
  const filter: OrderFilter = query.filter === "all" ? "all" : "attention";
  const t = await getTranslations();
  const [orders, events] = await Promise.all([listOrders(filter), listPaymentEvents()]);
  const at = (value: string | null) =>
    value ? formatDateTime(value, locale, DEFAULT_TIMEZONE, { dateStyle: "short", timeStyle: "short" }) : "—";
  const reasonField = { name: "reason", label: t("common.reason"), type: "textarea" as const, required: true };

  return (
    <>
      <AdminHeader title={t("admin.nav.payments")} description={t("admin.payments.description")} />
      <nav aria-label={t("admin.payments.filter")} className="mb-4 inline-flex rounded-xl bg-muted p-1">
        {(["attention", "all"] as const).map((value) => (
          <Link
            key={value}
            href={value === "all" ? "/admin/payments?filter=all" : "/admin/payments"}
            aria-current={filter === value ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-semibold text-muted-foreground",
              filter === value && "bg-card text-foreground shadow-sm",
            )}
          >
            {t(`admin.payments.${value}`)}
          </Link>
        ))}
      </nav>
      {orders.length === 0 ? (
        <p className="mb-8 text-sm text-muted-foreground">{t("admin.payments.empty")}</p>
      ) : (
        <div className="mb-8 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="p-3 font-medium">
                  {t("checkout.createdAt")}
                </th>
                <th scope="col" className="p-3 font-medium">
                  {t("admin.payments.member")}
                </th>
                <th scope="col" className="p-3 font-medium">
                  {t("checkout.plan")}
                </th>
                <th scope="col" className="p-3 font-medium">
                  {t("checkout.amount")}
                </th>
                <th scope="col" className="p-3 font-medium">
                  {t("common.status")}
                </th>
                <th scope="col" className="p-3 font-medium">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-border align-top last:border-0">
                  <td className="p-3 whitespace-nowrap">
                    {at(order.created_at)}
                    <span className="block font-mono text-xs text-muted-foreground">
                      {order.id.slice(0, 8).toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/users/${order.user_id}`} className="hover:underline">
                      {order.profile?.display_name || order.user_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="p-3">{localized(order.plan_version?.name, locale)}</td>
                  <td className="p-3 whitespace-nowrap">
                    {formatMoney(order.amount_minor, locale, t("common.currency"))}
                    <span className="block text-xs text-muted-foreground">
                      {order.provider}
                      {order.is_demo ? ` · ${t("demo.badge")}` : ""}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{t(`orderStatus.${order.status}`)}</Badge>
                      {order.needs_reconciliation ? (
                        <Badge variant="warning">{t("admin.payments.needsReview")}</Badge>
                      ) : null}
                    </div>
                    {order.reconciliation_note ? (
                      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{order.reconciliation_note}</p>
                    ) : null}
                    {order.refund_reference ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("admin.payments.reference", { reference: order.refund_reference })}
                      </p>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {order.status === "paid" ? (
                        <ActionDialog
                          trigger={t("admin.payments.recordRefund")}
                          title={t("admin.payments.refundTitle")}
                          description={t("admin.payments.refundText")}
                          action={recordRefundAction}
                          hidden={{ orderId: order.id }}
                          fields={[
                            {
                              name: "reference",
                              label: t("admin.payments.refundReference"),
                              hint: t("admin.payments.refundReferenceHint"),
                              required: true,
                            },
                            reasonField,
                          ]}
                          submitLabel={t("admin.payments.recordRefund")}
                          submitVariant="destructive"
                          successMessage={t("admin.saved")}
                        />
                      ) : null}
                      {order.needs_reconciliation ? (
                        <ActionDialog
                          trigger={t("admin.payments.resolve")}
                          triggerVariant="ghost"
                          title={t("admin.payments.resolveTitle")}
                          action={resolveReconciliationAction}
                          hidden={{ orderId: order.id }}
                          fields={[reasonField]}
                          submitLabel={t("admin.payments.resolve")}
                          successMessage={t("admin.saved")}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">{t("admin.payments.events")}</h2>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="p-3 font-medium">
                {t("admin.payments.received")}
              </th>
              <th scope="col" className="p-3 font-medium">
                {t("admin.payments.event")}
              </th>
              <th scope="col" className="p-3 font-medium">
                {t("admin.payments.outcome")}
              </th>
              <th scope="col" className="p-3 font-medium">
                {t("admin.payments.order")}
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b border-border last:border-0">
                <td className="p-3 whitespace-nowrap">{at(event.received_at)}</td>
                <td className="p-3">
                  {event.provider} · {event.event_type}
                </td>
                <td className="p-3">
                  <Badge
                    variant={
                      event.outcome === "processed"
                        ? "success"
                        : event.outcome === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {event.outcome}
                  </Badge>{" "}
                  <span className="font-mono text-xs">{event.outcome_code}</span>
                </td>
                <td className="p-3 font-mono text-xs">
                  {event.order_id ? event.order_id.slice(0, 8).toUpperCase() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
