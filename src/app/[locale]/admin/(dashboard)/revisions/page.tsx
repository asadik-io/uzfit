import { ChevronRight, ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { AdminHeader } from "@/features/admin/admin-header";
import { listRevisions } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/revisions">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "admin.nav" });
  return { title: t("revisions"), robots: { index: false } };
}

export default async function RevisionsPage({ params }: PageProps<"/[locale]/admin/revisions">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdmin(locale, `/${locale}/admin/revisions`);
  const t = await getTranslations();
  const [submitted, reviewed] = await Promise.all([listRevisions("submitted"), listRevisions("reviewed")]);
  const at = (value: string | null) =>
    value ? formatDateTime(value, locale, DEFAULT_TIMEZONE, { dateStyle: "medium", timeStyle: "short" }) : "—";

  return (
    <>
      <AdminHeader title={t("admin.nav.revisions")} description={t("admin.revisions.description")} />
      <section aria-labelledby="queue" className="mb-8">
        <h2 id="queue" className="mb-3 text-lg font-semibold">
          {t("admin.revisions.queue", { count: submitted.length })}
        </h2>
        {submitted.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={t("admin.revisions.emptyTitle")} className="py-8" />
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {submitted.map((revision) => (
              <li key={revision.id}>
                <Link href={`/admin/revisions/${revision.id}`} className="flex items-center gap-3 p-4 hover:bg-muted">
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {localized(revision.venue?.name, locale)}
                      {revision.venue?.publication_status === "draft" ? (
                        <Badge variant="info">{t("admin.revisions.firstPublication")}</Badge>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {revision.venue?.organization?.name} ·{" "}
                      {t("admin.revisions.submittedAt", { time: at(revision.submitted_at) })}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="history">
        <h2 id="history" className="mb-3 text-lg font-semibold">
          {t("admin.revisions.history")}
        </h2>
        {reviewed.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.revisions.noHistory")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {reviewed.map((revision) => (
              <li key={revision.id}>
                <Link
                  href={`/admin/revisions/${revision.id}`}
                  className="flex flex-wrap items-center gap-2 p-4 text-sm hover:bg-muted"
                >
                  <span className="font-medium">{localized(revision.venue?.name, locale)}</span>
                  <Badge variant={revision.status === "approved" ? "success" : "destructive"}>
                    {t(`partner.revisionStatus.${revision.status}`)}
                  </Badge>
                  <span className="text-muted-foreground">{at(revision.reviewed_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
