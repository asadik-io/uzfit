import { SearchX, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { VenueCard } from "@/components/venue/venue-card";
import { upcomingDays } from "@/features/discovery/date-options";
import { ExploreFilters } from "@/features/discovery/explore-filters";
import { parseExploreFilters } from "@/features/discovery/params";
import { getFilterOptions, getMyMembership, PAGE_SIZE, searchVenues } from "@/features/discovery/queries";
import { getViewer } from "@/lib/auth";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized, type LocalizedText } from "@/lib/localized";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/explore">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "explore" });
  return { title: t("title"), description: t("description") };
}

async function memberVenueIds(): Promise<Set<string> | null> {
  const membership = await getMyMembership();
  if (!membership) {
    return null;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_version_venues")
    .select("venue_id")
    .eq("plan_version_id", membership.plan_version_id);
  return new Set((data ?? []).map((row) => row.venue_id));
}

export default async function ExplorePage({ params, searchParams }: PageProps<"/[locale]/explore">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const query = await searchParams;
  const filters = parseExploreFilters(query);
  const t = await getTranslations();
  const viewer = await getViewer();

  const [options, eligible] = await Promise.all([
    getFilterOptions(),
    viewer ? memberVenueIds() : Promise.resolve(null),
  ]);
  let result: Awaited<ReturnType<typeof searchVenues>> | null = null;
  try {
    result = await searchVenues(filters, locale);
  } catch {
    result = null;
  }

  const cityById = new Map(options.cities.map((c) => [c.id, c.slug]));
  const categoryBySlug = new Map(options.categories.map((c) => [c.slug, c.name as LocalizedText]));
  const planNameByCode = new Map(options.plans.map((p) => [p.code, localized(p.name, locale)]));
  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const queryForLinks = {
    q: filters.q,
    city: filters.city,
    district: filters.district,
    category: filters.category,
    date: filters.date,
    plan: filters.plan,
    near: filters.near ? `${filters.near.lat},${filters.near.lng}` : undefined,
  };

  return (
    <div className="container-page">
      <PageHeader title={t("explore.title")} description={t("explore.description")} />
      <ExploreFilters
        values={{
          q: filters.q ?? "",
          city: filters.city ?? options.cities[0]?.slug ?? "",
          district: filters.district ?? "",
          category: filters.category ?? "",
          date: filters.date ?? "",
          plan: filters.plan ?? "",
          near: queryForLinks.near ?? "",
        }}
        cities={options.cities.map((c) => ({ slug: c.slug, name: c.name as LocalizedText }))}
        districts={options.districts.map((d) => ({
          slug: d.slug,
          name: d.name as LocalizedText,
          citySlug: cityById.get(d.city_id) ?? "",
        }))}
        categories={options.categories.map((c) => ({ slug: c.slug, name: c.name as LocalizedText }))}
        plans={options.plans}
        dates={upcomingDays(locale, { today: t("explore.today"), tomorrow: t("explore.tomorrow") })}
      />

      <section aria-labelledby="results-heading" className="mt-6">
        <h2 id="results-heading" className="sr-only">
          {t("explore.title")}
        </h2>
        {result === null ? (
          <EmptyState
            icon={TriangleAlert}
            title={t("explore.errorTitle")}
            description={t("errors.UNEXPECTED_ERROR")}
            action={
              <Button asChild>
                <Link
                  href={{
                    pathname: "/explore",
                    query: Object.fromEntries(Object.entries(queryForLinks).filter(([, v]) => v)) as Record<
                      string,
                      string
                    >,
                  }}
                >
                  {t("common.retry")}
                </Link>
              </Button>
            }
          />
        ) : result.items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={t("explore.emptyTitle")}
            description={t("explore.emptyText")}
            action={
              <Button asChild variant="outline">
                <Link href="/explore">{t("explore.reset")}</Link>
              </Button>
            }
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
              {t("explore.results", { count: result.total })}
            </p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.items.map((venue, index) => (
                <li key={venue.id}>
                  <VenueCard
                    slug={venue.slug}
                    name={venue.name as LocalizedText}
                    districtName={venue.district_name as LocalizedText}
                    coverPath={venue.cover_path}
                    coverAlt={venue.cover_alt as LocalizedText | null}
                    categories={venue.category_slugs.map((slug) => ({
                      slug,
                      name: categoryBySlug.get(slug) ?? { uz: slug },
                    }))}
                    planNames={venue.plan_codes.map((code) => planNameByCode.get(code) ?? code)}
                    isDemo={venue.is_demo}
                    distanceKm={venue.distance_km}
                    memberEligible={eligible ? eligible.has(venue.id) : null}
                    locale={locale}
                    priority={index < 3}
                  />
                </li>
              ))}
            </ul>
            <Pagination page={filters.page} pages={pages} pathname="/explore" query={queryForLinks} />
          </>
        )}
      </section>
    </div>
  );
}
