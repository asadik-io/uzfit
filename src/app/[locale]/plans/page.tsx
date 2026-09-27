import { CircleCheck, CircleSlash, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { getMyMembership, getPublishedPlans } from "@/features/discovery/queries";
import { PlanCard } from "@/features/plans/plan-card";
import { getViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";

export async function generateMetadata({ params }: PageProps<"/[locale]/plans">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "plans" });
  return { title: t("title"), description: t("description") };
}

export default async function PlansPage({ params }: PageProps<"/[locale]/plans">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations();
  const viewer = await getViewer();
  const [plans, membership] = await Promise.all([
    getPublishedPlans(),
    viewer ? getMyMembership() : Promise.resolve(null),
  ]);

  return (
    <div className="container-page">
      <PageHeader title={t("plans.title")} description={t("plans.description")} />
      <div className="mb-6 flex flex-col gap-3">
        {isDemoMode() ? <Alert variant="warning">{t("plans.sampleNotice")}</Alert> : null}
        {membership ? (
          <Alert variant="info" title={t("plans.activeTitle", { plan: localized(membership.plan_name, locale) })}>
            {t("plans.activeText", {
              date: formatDateTime(membership.ends_at, locale, DEFAULT_TIMEZONE, {
                dateStyle: "long",
                timeStyle: "short",
              }),
            })}{" "}
            <Link href="/membership" className="font-semibold underline">
              {t("nav.membership")}
            </Link>
          </Alert>
        ) : null}
      </div>
      {plans.length === 0 ? (
        <EmptyState title={t("plans.emptyTitle")} description={t("plans.emptyText")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              locale={locale}
              current={membership?.plan_code === plan.plan.code}
              hasActiveMembership={Boolean(membership)}
            />
          ))}
        </div>
      )}

      <section aria-labelledby="visits-heading" className="mt-10 rounded-2xl border border-border bg-card p-6">
        <h2 id="visits-heading" className="mb-4 text-xl font-semibold">
          {t("plans.howVisitsWork")}
        </h2>
        <ul className="grid gap-4 text-sm sm:grid-cols-3">
          <li className="flex gap-3">
            <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span>{t("plans.visitRuleReserve")}</span>
          </li>
          <li className="flex gap-3">
            <RotateCcw className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span>{t("plans.visitRuleReturn")}</span>
          </li>
          <li className="flex gap-3">
            <CircleSlash className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span>{t("plans.visitRuleUse")}</span>
          </li>
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">{t("plans.noUnlimited")}</p>
      </section>
    </div>
  );
}
