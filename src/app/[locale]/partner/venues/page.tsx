import { Plus, Store } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { partnerContext } from "@/features/partner/context";
import { VenueStatusBadges } from "@/features/partner/partner-header";
import { formatDateTime } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/partner/venues">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "partner.nav" });
  return { title: t("venues"), robots: { index: false } };
}

export default async function PartnerVenuesPage({ params }: PageProps<"/[locale]/partner/venues">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const { venues, managerOrgs } = await partnerContext(locale, `/${locale}/partner/venues`, undefined);
  if (managerOrgs.length === 0) {
    redirect(`/${locale}/partner`);
  }
  const t = await getTranslations();
  const managed = venues.filter((v) => v.role === "manager");
  const supabase = await createClient();
  const { data: revisions } =
    managed.length > 0
      ? await supabase
          .from("venue_revisions")
          .select("venue_id, status, updated_at")
          .in(
            "venue_id",
            managed.map((v) => v.id),
          )
          .order("created_at", { ascending: false })
      : { data: [] };
  const latest = new Map<string, { status: string; updated_at: string }>();
  for (const revision of revisions ?? []) {
    if (!latest.has(revision.venue_id)) {
      latest.set(revision.venue_id, revision);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("partner.nav.venues")}</h1>
          <p className="text-sm text-muted-foreground">{t("partner.venue.listDescription")}</p>
        </div>
        <Button asChild>
          <Link href="/partner/venues/new">
            <Plus aria-hidden="true" />
            {t("partner.newVenue")}
          </Link>
        </Button>
      </div>
      {managed.length === 0 ? (
        <EmptyState icon={Store} title={t("partner.noVenuesTitle")} description={t("partner.noVenuesManager")} />
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {managed.map((venue) => {
            const revision = latest.get(venue.id);
            return (
              <li key={venue.id}>
                <Link href={`/partner/venues/${venue.id}`} className="flex flex-col gap-1.5 p-4 hover:bg-muted">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {localized(venue.name, locale)}
                    <VenueStatusBadges venue={venue} />
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {venue.organizationName} · /{venue.slug}
                    {revision ? (
                      <Badge
                        variant={
                          revision.status === "rejected"
                            ? "destructive"
                            : revision.status === "submitted"
                              ? "info"
                              : "secondary"
                        }
                      >
                        {t(
                          `partner.revisionStatus.${revision.status as "draft" | "submitted" | "approved" | "rejected"}`,
                        )}{" "}
                        · {formatDateTime(revision.updated_at, locale, DEFAULT_TIMEZONE, { dateStyle: "medium" })}
                      </Badge>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
