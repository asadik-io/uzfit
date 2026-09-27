import { Search } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { AdminHeader } from "@/features/admin/admin-header";
import { findUsers } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/users">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "admin.nav" });
  return { title: t("users"), robots: { index: false } };
}

export default async function AdminUsersPage({ params, searchParams }: PageProps<"/[locale]/admin/users">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdmin(locale, `/${locale}/admin/users`);
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.slice(0, 120) : "";
  const t = await getTranslations();
  const users = await findUsers(q);

  return (
    <>
      <AdminHeader title={t("admin.nav.users")} description={t("admin.users.description")} />
      <form method="get" role="search" className="mb-4 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="q">
          {t("admin.users.search")}
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder={t("admin.users.searchPlaceholder")}
          className="h-11 min-w-56 flex-1 rounded-lg border border-input bg-card px-3 text-sm"
        />
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          <Search aria-hidden="true" />
          {t("common.search")}
        </button>
      </form>
      <p className="mb-2 text-xs text-muted-foreground">{t("admin.users.limitNote")}</p>
      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.users.noResults")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {users.map((user) => (
            <li key={user.user_id}>
              <Link href={`/admin/users/${user.user_id}`} className="flex flex-col gap-1 p-4 hover:bg-muted">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {user.display_name || "—"}
                  <span className="text-sm font-normal text-muted-foreground">{user.email}</span>
                  {user.is_admin ? <Badge variant="info">{t("admin.users.adminBadge")}</Badge> : null}
                  {user.account_status === "suspended" ? (
                    <Badge variant="destructive">{t("admin.users.suspended")}</Badge>
                  ) : null}
                  {user.organization_count > 0 ? (
                    <Badge variant="secondary">{t("admin.users.staffBadge")}</Badge>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {user.current_plan_code
                    ? t("admin.users.currentPlan", {
                        plan: user.current_plan_code,
                        date: formatDateTime(user.current_membership_ends_at ?? "", locale, DEFAULT_TIMEZONE, {
                          dateStyle: "medium",
                        }),
                      })
                    : t("admin.users.noPlan")}{" "}
                  ·{" "}
                  {t("admin.users.joined", {
                    date: formatDateTime(user.created_at, locale, DEFAULT_TIMEZONE, { dateStyle: "medium" }),
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
