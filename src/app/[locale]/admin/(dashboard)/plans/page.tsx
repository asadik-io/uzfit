import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionDialog, ActionForm } from "@/features/admin/action-form";
import { createPlanAction, planVersionAction } from "@/features/admin/actions";
import { AdminHeader } from "@/features/admin/admin-header";
import { PlanVersionForm } from "@/features/admin/plan-version-form";
import { listPlans } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/lib/i18n/routing";
import { localized, type LocalizedText } from "@/lib/localized";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/plans">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "admin.nav" });
  return { title: t("plans"), robots: { index: false } };
}

export default async function AdminPlansPage({ params }: PageProps<"/[locale]/admin/plans">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdmin(locale, `/${locale}/admin/plans`);
  const t = await getTranslations();
  const { plans, venues } = await listPlans();
  const venueOptions = venues.map((v) => ({
    id: v.id,
    name: v.name as LocalizedText,
    published: v.publication_status === "published",
  }));

  return (
    <>
      <AdminHeader title={t("admin.nav.plans")} description={t("admin.plans.description")} />
      <div className="flex flex-col gap-6">
        {plans.map((plan) => {
          const versions = [...plan.plan_versions].sort((a, b) => b.version - a.version);
          const latest = versions[0];
          return (
            <Card key={plan.id}>
              <CardHeader>
                <CardTitle as="h2" className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{plan.code}</span>
                  {!plan.is_active ? <Badge variant="warning">{t("admin.plans.inactive")}</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("admin.plans.noVersions")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th scope="col" className="py-2 pr-3 font-medium">
                            {t("admin.plans.version")}
                          </th>
                          <th scope="col" className="py-2 pr-3 font-medium">
                            {t("common.status")}
                          </th>
                          <th scope="col" className="py-2 pr-3 font-medium">
                            {t("admin.plans.terms")}
                          </th>
                          <th scope="col" className="py-2 font-medium">
                            {t("common.actions")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {versions.map((version) => (
                          <tr key={version.id} className="border-b border-border align-top last:border-0">
                            <td className="py-2 pr-3">
                              v{version.version} · {localized(version.name, locale)}
                              {version.is_demo ? (
                                <Badge variant="demo" className="ml-1">
                                  {t("demo.badge")}
                                </Badge>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3">
                              <Badge
                                variant={
                                  version.status === "published"
                                    ? "success"
                                    : version.status === "draft"
                                      ? "info"
                                      : "secondary"
                                }
                              >
                                {t(`admin.plans.status.${version.status}`)}
                              </Badge>
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">
                              {formatMoney(version.price_minor, locale, t("common.currency"))} ·{" "}
                              {t("plans.visitAllowance", {
                                visits: t("common.visits", { count: version.visit_allowance }),
                                days: t("common.days", { count: version.duration_days }),
                              })}{" "}
                              · {t("plans.venuesIncluded", { count: version.plan_version_venues.length })}
                            </td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-2">
                                {version.status === "draft" ? (
                                  <>
                                    <ActionDialog
                                      trigger={t("admin.plans.publish")}
                                      title={t("admin.plans.publishTitle")}
                                      description={t("admin.plans.publishText")}
                                      action={planVersionAction}
                                      hidden={{ planVersionId: version.id, operation: "publish" }}
                                      submitLabel={t("admin.plans.publish")}
                                      successMessage={t("admin.saved")}
                                    />
                                    <ActionDialog
                                      trigger={t("admin.plans.deleteDraft")}
                                      triggerVariant="ghost"
                                      title={t("admin.plans.deleteTitle")}
                                      action={planVersionAction}
                                      hidden={{ planVersionId: version.id, operation: "delete" }}
                                      submitLabel={t("admin.plans.deleteDraft")}
                                      submitVariant="destructive"
                                      successMessage={t("admin.saved")}
                                    />
                                  </>
                                ) : null}
                                {version.status === "published" ? (
                                  <ActionDialog
                                    trigger={t("admin.plans.retire")}
                                    triggerVariant="ghost"
                                    title={t("admin.plans.retireTitle")}
                                    description={t("admin.plans.retireText")}
                                    action={planVersionAction}
                                    hidden={{ planVersionId: version.id, operation: "retire" }}
                                    submitLabel={t("admin.plans.retire")}
                                    submitVariant="destructive"
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
                <details className="rounded-xl border border-border p-4">
                  <summary className="cursor-pointer font-medium">{t("admin.plans.newVersion")}</summary>
                  <p className="mt-2 mb-4 text-sm text-muted-foreground">{t("admin.plans.newVersionText")}</p>
                  <PlanVersionForm
                    planId={plan.id}
                    venues={venueOptions}
                    defaults={{
                      name: (latest?.name as LocalizedText) ?? { uz: "" },
                      description: (latest?.description as LocalizedText) ?? { uz: "" },
                      priceSom: latest ? Math.round(latest.price_minor / 100) : 0,
                      durationDays: latest?.duration_days ?? 30,
                      visitAllowance: latest?.visit_allowance ?? 8,
                      dailyVisitLimit: latest?.daily_visit_limit ?? 1,
                      maxFutureBookings: latest?.max_future_bookings ?? 3,
                      bookingWindowDays: latest?.booking_window_days ?? 7,
                      freeCancellationMinutes: latest?.free_cancellation_minutes ?? 120,
                      isDemo: latest?.is_demo ?? false,
                      venueIds: latest?.plan_version_venues.map((v) => v.venue_id) ?? [],
                    }}
                  />
                </details>
              </CardContent>
            </Card>
          );
        })}
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("admin.plans.createPlan")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={createPlanAction}
              fields={[
                {
                  name: "code",
                  label: t("admin.plans.code"),
                  hint: t("admin.plans.codeHint"),
                  required: true,
                  maxLength: 40,
                },
                { name: "sortOrder", label: t("admin.plans.sortOrder"), type: "number", defaultValue: "0" },
              ]}
              submitLabel={t("admin.plans.createPlan")}
              successMessage={t("admin.saved")}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
