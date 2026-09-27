import { ArrowRight, CalendarCheck, QrCode, Search, Ticket } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { categoryIcon } from "@/components/venue/icons";
import { VenueCard } from "@/components/venue/venue-card";
import { getFilterOptions, getPublishedPlans, searchVenues } from "@/features/discovery/queries";
import { isDemoMode } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized, type LocalizedText } from "@/lib/localized";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations();
  const [options, featured, plans] = await Promise.all([
    getFilterOptions(),
    searchVenues({ page: 1 }, locale).catch(() => null),
    getPublishedPlans().catch(() => []),
  ]);
  const categoryBySlug = new Map(options.categories.map((c) => [c.slug, c.name as LocalizedText]));
  const planNameByCode = new Map(options.plans.map((p) => [p.code, localized(p.name, locale)]));
  const cheapest = plans.reduce<(typeof plans)[number] | null>(
    (min, plan) => (!min || plan.price_minor < min.price_minor ? plan : min),
    null,
  );

  const steps = [
    { icon: Ticket, title: t("home.step1Title"), text: t("home.step1Text") },
    { icon: CalendarCheck, title: t("home.step2Title"), text: t("home.step2Text") },
    { icon: QrCode, title: t("home.step3Title"), text: t("home.step3Text") },
  ];

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-800 via-primary to-emerald-600 text-primary-foreground">
        <div aria-hidden="true" className="absolute -top-24 -right-24 size-80 rounded-full bg-accent/25 blur-3xl" />
        <div className="container-page relative flex flex-col gap-6 py-14 sm:py-20">
          <h1 className="max-w-3xl text-4xl leading-tight font-extrabold tracking-tight text-balance sm:text-5xl">
            {t("home.heroTitle")}
          </h1>
          <p className="max-w-2xl text-lg text-emerald-50">{t("home.heroSubtitle")}</p>
          <form action={`/${locale}/explore`} method="get" role="search" className="flex max-w-xl gap-2">
            <label className="relative flex-1">
              <span className="sr-only">{t("home.searchLabel")}</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                name="q"
                placeholder={t("home.searchPlaceholder")}
                className="h-12 pl-10 text-base"
                maxLength={80}
              />
            </label>
            <Button type="submit" variant="accent" size="lg">
              {t("common.search")}
            </Button>
          </form>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/explore">
                {t("home.exploreCta")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/40 bg-transparent text-white hover:bg-white/10"
            >
              <Link href="/plans">{t("home.plansCta")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="container-page flex flex-col gap-14 py-12">
        <section aria-labelledby="categories-heading">
          <h2 id="categories-heading" className="mb-4 text-2xl font-bold">
            {t("home.categoriesTitle")}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {options.categories.map((category) => {
              const Icon = categoryIcon(category.slug);
              return (
                <li key={category.slug}>
                  <Link
                    href={`/explore?category=${category.slug}`}
                    className="flex h-full min-h-24 flex-col items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 font-semibold transition-colors hover:border-primary hover:bg-primary-soft"
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    {localized(category.name, locale)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {featured && featured.items.length > 0 ? (
          <section aria-labelledby="featured-heading">
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 id="featured-heading" className="text-2xl font-bold">
                {t("home.featuredTitle")}
              </h2>
              <Link href="/explore" className="text-sm font-semibold text-primary hover:underline">
                {t("common.seeAll")}
              </Link>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.items.slice(0, 6).map((venue) => (
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
                    locale={locale}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="how-heading">
          <h2 id="how-heading" className="mb-4 text-2xl font-bold">
            {t("home.howTitle")}
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <span className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">{index + 1}</span>
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {cheapest ? (
          <section
            aria-labelledby="plans-heading"
            className="flex flex-col items-start gap-4 rounded-2xl bg-accent p-6 text-accent-foreground sm:flex-row sm:items-center sm:justify-between sm:p-8"
          >
            <div className="flex flex-col gap-2">
              <h2 id="plans-heading" className="text-2xl font-bold">
                {t("home.plansTitle", {
                  price: formatMoney(cheapest.price_minor, locale, t("common.currency")),
                  days: t("common.days", { count: cheapest.duration_days }),
                })}
              </h2>
              <p>{t("home.plansText")}</p>
              {isDemoMode() ? <p className="text-sm font-medium">{t("home.sampleNotice")}</p> : null}
            </div>
            <Button asChild size="lg">
              <Link href="/plans">{t("home.plansCta")}</Link>
            </Button>
          </section>
        ) : null}
      </div>
    </>
  );
}
