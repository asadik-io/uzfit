import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/features/admin/action-form";
import { createOrganizationAction } from "@/features/admin/actions";
import { AdminHeader } from "@/features/admin/admin-header";
import { listOrganizations } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/organizations">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "admin.nav" });
  return { title: t("organizations"), robots: { index: false } };
}

export default async function OrganizationsPage({ params }: PageProps<"/[locale]/admin/organizations">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdmin(locale, `/${locale}/admin/organizations`);
  const t = await getTranslations();
  const organizations = await listOrganizations();
  const count = (value: unknown) =>
    Array.isArray(value) && typeof value[0]?.count === "number" ? (value[0].count as number) : 0;

  return (
    <>
      <AdminHeader title={t("admin.nav.organizations")} description={t("admin.orgs.description")} />
      <ul className="mb-6 flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {organizations.map((org) => (
          <li key={org.id}>
            <Link href={`/admin/organizations/${org.id}`} className="flex items-center gap-3 p-4 hover:bg-muted">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {org.name}
                  {org.status === "suspended" ? <Badge variant="destructive">{t("admin.orgs.suspended")}</Badge> : null}
                  {org.is_demo ? <Badge variant="demo">{t("demo.badge")}</Badge> : null}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t("admin.orgs.counts", { members: count(org.organization_members), venues: count(org.venues) })}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("admin.orgs.create")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={createOrganizationAction}
            fields={[
              { name: "name", label: t("admin.orgs.name"), required: true, maxLength: 120 },
              { name: "isDemo", label: t("admin.orgs.isDemo"), type: "checkbox" },
            ]}
            submitLabel={t("admin.orgs.create")}
            successMessage={t("admin.saved")}
          />
        </CardContent>
      </Card>
    </>
  );
}
