import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { AdminHeader } from "@/features/admin/admin-header";
import { AUDIT_PAGE_SIZE, listAuditLogs } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/audit">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "admin.nav" });
  return { title: t("audit"), robots: { index: false } };
}

export default async function AuditPage({ params, searchParams }: PageProps<"/[locale]/admin/audit">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdmin(locale, `/${locale}/admin/audit`);
  const query = await searchParams;
  const action = typeof query.action === "string" && /^[a-z_.]{1,60}$/.test(query.action) ? query.action : undefined;
  const target = typeof query.target === "string" && query.target.length <= 200 ? query.target : undefined;
  const pageNumber = Number(query.page);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 && pageNumber <= 1000 ? pageNumber : 1;
  const t = await getTranslations();
  const { rows, total } = await listAuditLogs({ action, target, page });

  return (
    <>
      <AdminHeader title={t("admin.nav.audit")} description={t("admin.audit.description")} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1 font-medium">
          {t("admin.audit.action")}
          <input
            name="action"
            defaultValue={action}
            placeholder="membership."
            className="h-10 rounded-lg border border-input bg-card px-3"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t("admin.audit.target")}
          <input
            name="target"
            defaultValue={target}
            className="h-10 w-72 max-w-full rounded-lg border border-input bg-card px-3 font-mono text-xs"
          />
        </label>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          {t("partner.reports.apply")}
        </button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="p-3 font-medium">
                {t("admin.audit.time")}
              </th>
              <th scope="col" className="p-3 font-medium">
                {t("admin.audit.actor")}
              </th>
              <th scope="col" className="p-3 font-medium">
                {t("admin.audit.action")}
              </th>
              <th scope="col" className="p-3 font-medium">
                {t("admin.audit.target")}
              </th>
              <th scope="col" className="p-3 font-medium">
                {t("common.reason")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border align-top last:border-0">
                <td className="p-3 whitespace-nowrap">
                  {formatDateTime(row.created_at, locale, DEFAULT_TIMEZONE, {
                    dateStyle: "short",
                    timeStyle: "medium",
                  })}
                  {row.request_id ? (
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {row.request_id.slice(0, 13)}
                    </span>
                  ) : null}
                </td>
                <td className="p-3">
                  {row.actor_role}
                  {row.actor_id ? (
                    <Link
                      href={`/admin/users/${row.actor_id}`}
                      className="block font-mono text-xs text-primary hover:underline"
                    >
                      {row.actor_id.slice(0, 8)}
                    </Link>
                  ) : null}
                </td>
                <td className="p-3 font-mono text-xs">{row.action}</td>
                <td className="p-3 font-mono text-xs break-all">
                  {row.target_type}
                  {row.target_id ? `:${row.target_id.slice(0, 36)}` : ""}
                </td>
                <td className="p-3">
                  {row.reason ?? "—"}
                  {row.before_data || row.after_data || Object.keys(row.metadata ?? {}).length > 0 ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted-foreground">{t("common.details")}</summary>
                      <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted p-2 text-[11px]">
                        {JSON.stringify(
                          { before: row.before_data, after: row.after_data, metadata: row.metadata },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pages={Math.max(Math.ceil(total / AUDIT_PAGE_SIZE), 1)}
        pathname="/admin/audit"
        query={{ action, target }}
      />
    </>
  );
}
