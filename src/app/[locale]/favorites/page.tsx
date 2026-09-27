import { Heart } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { FavoriteButton } from "@/components/venue/favorite-button";
import { VenueCard } from "@/components/venue/venue-card";
import { requireViewer } from "@/lib/auth";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import type { LocalizedText } from "@/lib/localized";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/favorites">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "favorites" });
  return { title: t("title"), robots: { index: false } };
}

export default async function FavoritesPage({ params }: PageProps<"/[locale]/favorites">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireViewer(locale, `/${locale}/favorites`);
  const t = await getTranslations();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("favorites")
    .select(
      `created_at, venue:venues(id, slug, name, is_demo, district:districts(name),
       venue_categories(category:categories(slug, name, sort_order)),
       venue_images(storage_path, alt, sort_order))`,
    )
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error("favorites_query_failed");
  }
  // Venues that are no longer public are hidden by RLS and drop out of the list.
  const venues = (data ?? []).map((row) => row.venue).filter((v): v is NonNullable<typeof v> => Boolean(v));

  return (
    <div className="container-page">
      <PageHeader title={t("favorites.title")} description={t("favorites.description")} />
      {venues.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={t("favorites.emptyTitle")}
          description={t("favorites.emptyText")}
          action={
            <Button asChild>
              <Link href="/explore">{t("nav.explore")}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((venue) => {
            const images = [...venue.venue_images].sort((a, b) => a.sort_order - b.sort_order);
            const categories = venue.venue_categories
              .map((vc) => vc.category)
              .filter((c): c is NonNullable<typeof c> => Boolean(c))
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((c) => ({ slug: c.slug, name: c.name as LocalizedText }));
            return (
              <li key={venue.id} className="relative">
                <VenueCard
                  slug={venue.slug}
                  name={venue.name as LocalizedText}
                  districtName={(venue.district?.name ?? {}) as LocalizedText}
                  coverPath={images[0]?.storage_path ?? null}
                  coverAlt={(images[0]?.alt ?? null) as LocalizedText | null}
                  categories={categories}
                  isDemo={venue.is_demo}
                  locale={locale}
                />
                <div className="absolute top-3 right-3 z-10">
                  <FavoriteButton venueId={venue.id} initial signedIn loginHref="/login" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
