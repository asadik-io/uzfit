import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { ActionDialog } from "@/features/admin/action-form";
import { setVenueStatusAction } from "@/features/admin/actions";
import { AdminHeader } from "@/features/admin/admin-header";
import { listVenues } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/venues">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "admin.nav" });
  return { title: t("venues"), robots: { index: false } };
}

export default async function AdminVenuesPage({ params }: PageProps<"/[locale]/admin/venues">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdmin(locale, `/${locale}/admin/venues`);
  const t = await getTranslations();
  const venues = await listVenues();

  const reasonField = { name: "reason", label: t("common.reason"), type: "textarea" as const, required: true };
  const cancelField = { name: "cancelFuture", label: t("admin.venues.cancelFuture"), type: "checkbox" as const };

  return (
    <>
      <AdminHeader title={t("admin.nav.venues")} description={t("admin.venues.description")} />
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="p-3 font-medium">
                {t("partner.venue.name")}
              </th>
              <th scope="col" className="p-3 font-medium">
                {t("partner.venue.organization")}
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
            {venues.map((venue) => {
              const name = localized(venue.name, locale);
              const hidden = { venueId: venue.id };
              return (
                <tr key={venue.id} className="border-b border-border align-top last:border-0">
                  <td className="p-3">
                    <p className="font-medium">
                      {venue.publication_status === "published" ? (
                        <Link href={`/venues/${venue.slug}`} className="hover:underline">
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      /{venue.slug} · {localized(venue.district?.name, locale)}
                      {venue.is_demo ? ` · ${t("demo.badge")}` : ""}
                    </p>
                  </td>
                  <td className="p-3">{venue.organization?.name}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge
                        variant={
                          venue.publication_status === "published"
                            ? "success"
                            : venue.publication_status === "draft"
                              ? "secondary"
                              : "warning"
                        }
                      >
                        {t(`partner.venueStatus.${venue.publication_status}`)}
                      </Badge>
                      {venue.operational_status === "suspended" ? (
                        <Badge variant="destructive">{t("partner.venueStatus.suspended")}</Badge>
                      ) : null}
                    </div>
                    {venue.status_reason ? (
                      <p className="mt-1 text-xs text-muted-foreground">{venue.status_reason}</p>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/partner/attendance?${new URLSearchParams({ venue: venue.id, locale })}`}
                        className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-muted"
                        download
                      >
                        {t("admin.venues.attendanceCsv")}
                      </a>
                      {venue.publication_status === "unpublished" ? (
                        <ActionDialog
                          trigger={t("admin.venues.publish")}
                          title={t("admin.venues.publishTitle", { name })}
                          action={setVenueStatusAction}
                          hidden={{ ...hidden, action: "publish" }}
                          submitLabel={t("admin.venues.publish")}
                          successMessage={t("admin.saved")}
                        />
                      ) : null}
                      {venue.publication_status === "published" ? (
                        <ActionDialog
                          trigger={t("admin.venues.unpublish")}
                          title={t("admin.venues.unpublishTitle", { name })}
                          description={t("admin.venues.unpublishText")}
                          action={setVenueStatusAction}
                          hidden={{ ...hidden, action: "unpublish" }}
                          fields={[reasonField, cancelField]}
                          submitLabel={t("admin.venues.unpublish")}
                          submitVariant="destructive"
                          successMessage={t("admin.saved")}
                        />
                      ) : null}
                      {venue.operational_status === "active" ? (
                        <ActionDialog
                          trigger={t("admin.venues.suspend")}
                          triggerVariant="ghost"
                          title={t("admin.venues.suspendTitle", { name })}
                          description={t("admin.venues.suspendText")}
                          action={setVenueStatusAction}
                          hidden={{ ...hidden, action: "suspend" }}
                          fields={[reasonField, cancelField]}
                          submitLabel={t("admin.venues.suspend")}
                          submitVariant="destructive"
                          successMessage={t("admin.saved")}
                        />
                      ) : (
                        <ActionDialog
                          trigger={t("admin.venues.reinstate")}
                          title={t("admin.venues.reinstateTitle", { name })}
                          action={setVenueStatusAction}
                          hidden={{ ...hidden, action: "reinstate" }}
                          submitLabel={t("admin.venues.reinstate")}
                          successMessage={t("admin.saved")}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
