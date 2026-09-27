import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { ActivityForm } from "@/features/partner/activity-form";
import { EditActivityDialog } from "@/features/partner/activity-editor";
import { partnerContext } from "@/features/partner/context";
import { PartnerHeader } from "@/features/partner/partner-header";
import { getActivities, getReferenceData } from "@/features/partner/queries";
import type { Locale } from "@/lib/i18n/routing";
import { localized, type LocalizedText } from "@/lib/localized";

export async function generateMetadata({ params }: PageProps<"/[locale]/partner/activities">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "partner.nav" });
  return { title: t("activities"), robots: { index: false } };
}

export default async function ActivitiesPage({ params, searchParams }: PageProps<"/[locale]/partner/activities">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const query = await searchParams;
  const { venues, venue } = await partnerContext(locale, `/${locale}/partner/activities`, query.venue);
  if (!venue) {
    redirect(`/${locale}/partner`);
  }
  if (venue.role !== "manager") {
    redirect(`/${locale}/partner?venue=${venue.id}`);
  }
  const t = await getTranslations();
  const [activities, reference] = await Promise.all([getActivities(venue.id), getReferenceData()]);

  return (
    <>
      <PartnerHeader
        title={t("partner.nav.activities")}
        description={t("partner.activities.description")}
        venues={venues}
        venue={venue}
        locale={locale}
      />
      {activities.length === 0 ? (
        <EmptyState
          title={t("partner.activities.emptyTitle")}
          description={t("partner.activities.emptyText")}
          className="mb-6"
        />
      ) : (
        <ul className="mb-6 flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {activities.map((activity) => {
            const title = localized(activity.title, locale);
            return (
              <li key={activity.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {title}
                    <Badge variant="secondary">
                      {activity.kind === "class" ? t("venue.classKind") : t("venue.openGymKind")}
                    </Badge>
                    {!activity.is_active ? <Badge variant="warning">{t("partner.activities.inactive")}</Badge> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {localized(activity.category?.name, locale)} ·{" "}
                    {t("partner.sessions.minutes", { count: activity.duration_minutes })} ·{" "}
                    {t("partner.activities.capacityValue", { count: activity.default_capacity })}
                  </p>
                </div>
                <EditActivityDialog
                  venueId={venue.id}
                  categories={reference.categories}
                  title={title}
                  activity={{
                    id: activity.id,
                    title: activity.title as LocalizedText,
                    description: activity.description as LocalizedText,
                    durationMinutes: activity.duration_minutes,
                    defaultCapacity: activity.default_capacity,
                    isActive: activity.is_active,
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("partner.activities.newTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityForm venueId={venue.id} categories={reference.categories} />
        </CardContent>
      </Card>
    </>
  );
}
