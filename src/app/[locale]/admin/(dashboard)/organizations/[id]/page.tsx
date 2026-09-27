import { ArrowLeft, Search } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionDialog, ActionForm } from "@/features/admin/action-form";
import { removeOrgMemberAction, setOrganizationStatusAction, setOrgMemberAction } from "@/features/admin/actions";
import { findUsers, getOrganization } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/organizations/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "admin.nav" });
  return { title: t("organizations"), robots: { index: false } };
}

export default async function OrganizationPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/organizations/[id]">) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  setRequestLocale(locale);
  if (!z.guid().safeParse(id).success) {
    notFound();
  }
  await requireAdmin(locale, `/${locale}/admin/organizations/${id}`);
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.slice(0, 120) : "";
  const [org, results] = await Promise.all([getOrganization(id), q ? findUsers(q) : Promise.resolve([])]);
  if (!org) {
    notFound();
  }
  const t = await getTranslations();
  const memberIds = new Set(org.organization_members.map((m) => m.user_id));
  const roleOptions = [
    { value: "manager", label: t("partner.role.manager") },
    { value: "receptionist", label: t("partner.role.receptionist") },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin/organizations"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("admin.nav.organizations")}
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
            {org.name}
            {org.status === "suspended" ? <Badge variant="destructive">{t("admin.orgs.suspended")}</Badge> : null}
            {org.is_demo ? <Badge variant="demo">{t("demo.badge")}</Badge> : null}
          </h1>
        </div>
        <ActionDialog
          trigger={org.status === "active" ? t("admin.orgs.suspend") : t("admin.orgs.activate")}
          title={org.status === "active" ? t("admin.orgs.suspendTitle") : t("admin.orgs.activateTitle")}
          description={org.status === "active" ? t("admin.orgs.suspendText") : undefined}
          action={setOrganizationStatusAction}
          hidden={{ organizationId: org.id, status: org.status === "active" ? "suspended" : "active" }}
          fields={[{ name: "reason", label: t("common.reason"), type: "textarea", required: true }]}
          submitLabel={org.status === "active" ? t("admin.orgs.suspend") : t("admin.orgs.activate")}
          submitVariant={org.status === "active" ? "destructive" : "default"}
          successMessage={t("admin.saved")}
        />
      </div>
      {org.status_reason ? <Alert variant="warning">{org.status_reason}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("admin.orgs.members")}</CardTitle>
        </CardHeader>
        <CardContent>
          {org.organization_members.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.orgs.noMembers")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {org.organization_members.map((member) => (
                <li key={member.user_id} className="flex flex-wrap items-center gap-3 py-3">
                  <Link href={`/admin/users/${member.user_id}`} className="min-w-0 flex-1 font-medium hover:underline">
                    {member.profile?.display_name || member.user_id}
                  </Link>
                  <Badge variant="secondary">{t(`partner.role.${member.role}`)}</Badge>
                  <ActionDialog
                    trigger={t("admin.orgs.remove")}
                    triggerVariant="ghost"
                    title={t("admin.orgs.removeTitle", { name: member.profile?.display_name ?? "" })}
                    action={removeOrgMemberAction}
                    hidden={{ organizationId: org.id, userId: member.user_id }}
                    submitLabel={t("admin.orgs.remove")}
                    submitVariant="destructive"
                    successMessage={t("admin.saved")}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("admin.orgs.addMember")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form method="get" className="flex flex-wrap gap-2" role="search">
            <label className="sr-only" htmlFor="user-search">
              {t("admin.users.search")}
            </label>
            <input
              id="user-search"
              name="q"
              defaultValue={q}
              placeholder={t("admin.users.searchPlaceholder")}
              className="h-10 min-w-56 flex-1 rounded-lg border border-input bg-card px-3 text-sm"
            />
            <button type="submit" className={buttonVariants({ variant: "outline" })}>
              <Search aria-hidden="true" />
              {t("common.search")}
            </button>
          </form>
          {q && results.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.users.noResults")}</p>
          ) : null}
          <ul className="flex flex-col divide-y divide-border">
            {results
              .filter((user) => !memberIds.has(user.user_id))
              .map((user) => (
                <li key={user.user_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{user.display_name || "—"}</span>{" "}
                    <span className="text-muted-foreground">{user.email}</span>
                  </span>
                  <ActionForm
                    inline
                    action={setOrgMemberAction}
                    hidden={{ organizationId: org.id, userId: user.user_id }}
                    fields={[
                      {
                        name: "role",
                        label: t("admin.orgs.role"),
                        type: "select",
                        options: roleOptions,
                        defaultValue: "receptionist",
                      },
                    ]}
                    submitLabel={t("admin.orgs.add")}
                    successMessage={t("admin.saved")}
                  />
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("admin.nav.venues")}</CardTitle>
        </CardHeader>
        <CardContent>
          {org.venues.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("partner.noVenuesTitle")}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {org.venues.map((venue) => (
                <li key={venue.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{localized(venue.name, locale)}</span>
                  <Badge variant="secondary">{t(`partner.venueStatus.${venue.publication_status}`)}</Badge>
                  {venue.operational_status === "suspended" ? (
                    <Badge variant="destructive">{t("partner.venueStatus.suspended")}</Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
