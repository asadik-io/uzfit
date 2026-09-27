import { ArrowLeft, Clock, ExternalLink, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FavoriteButton } from "@/components/venue/favorite-button";
import { amenityIcon, categoryIcon } from "@/components/venue/icons";
import { VenueImage } from "@/components/venue/venue-image";
import { upcomingDays } from "@/features/discovery/date-options";
import {
  getMyLiveBookings,
  getMyMembership,
  getVenueBySlug,
  getVenuePlans,
  getVenueSessions,
  isFavorite,
  type VenueSession,
} from "@/features/discovery/queries";
import { SessionList, type SessionAction } from "@/features/discovery/session-list";
import { getViewer } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized, type LocalizedText } from "@/lib/localized";
import { formatPhone } from "@/lib/phone";
import { isDateString, localDateString, zonedTimeToUtc, isoWeekday } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/venues/[slug]">): Promise<Metadata> {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  const venue = await getVenueBySlug(slug).catch(() => null);
  if (!venue) {
    return {};
  }
  return {
    title: localized(venue.name, locale),
    description: localized(venue.description, locale).slice(0, 160) || undefined,
  };
}

async function isVenueInMyPlan(planVersionId: string, venueId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_version_venues")
    .select("venue_id")
    .eq("plan_version_id", planVersionId)
    .eq("venue_id", venueId)
    .maybeSingle();
  return Boolean(data);
}

export default async function VenuePage({ params, searchParams }: PageProps<"/[locale]/venues/[slug]">) {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  setRequestLocale(locale);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    notFound();
  }
  const venue = await getVenueBySlug(slug);
  if (!venue) {
    notFound();
  }
  const t = await getTranslations();
  const query = await searchParams;
  const tz = venue.timezone;
  const now = new Date();
  const days = upcomingDays(locale, { today: t("explore.today"), tomorrow: t("explore.tomorrow") }, 7, tz, now);
  const requestedDate = typeof query.date === "string" && isDateString(query.date) ? query.date : null;
  const selectedDate = requestedDate && days.some((d) => d.value === requestedDate) ? requestedDate : days[0]!.value;

  const viewer = await getViewer();
  const [plans, sessions, membership, favorite] = await Promise.all([
    getVenuePlans(venue.id),
    getVenueSessions(venue.id, selectedDate, tz),
    viewer ? getMyMembership() : Promise.resolve(null),
    viewer ? isFavorite(venue.id, viewer.id) : Promise.resolve(false),
  ]);
  const [myBookings, inMyPlan] = await Promise.all([
    viewer ? getMyLiveBookings(sessions.map((s) => s.id)) : Promise.resolve(new Map<string, string>()),
    membership ? isVenueInMyPlan(membership.plan_version_id, venue.id) : Promise.resolve(false),
  ]);

  const name = localized(venue.name, locale);
  const address = localized(venue.address, locale);
  const district = localized(venue.district.name, locale);
  const images = [...(venue.venue_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const categories = (venue.venue_categories ?? [])
    .map((vc) => vc.category)
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .sort((a, b) => a.sort_order - b.sort_order);
  const amenities = (venue.venue_amenities ?? [])
    .map((va) => va.amenity)
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .sort((a, b) => a.sort_order - b.sort_order);
  const hours = [...(venue.venue_opening_hours ?? [])].sort((a, b) => a.weekday - b.weekday);
  const todayWeekday = isoWeekday(localDateString(now, tz));
  const loginHref = `/login?next=${encodeURIComponent(`/${locale}/venues/${venue.slug}?date=${selectedDate}`)}`;
  const windowEnd = membership ? new Date(now.getTime() + membership.booking_window_days * 86_400_000) : null;

  const actionFor = (session: VenueSession): SessionAction => {
    const bookingId = myBookings.get(session.id);
    if (session.status === "cancelled") return { kind: "cancelled" };
    if (bookingId) return { kind: "booked", bookingId };
    if (new Date(session.starts_at) <= now) return { kind: "started" };
    if (session.occupied_count >= session.capacity) return { kind: "full" };
    if (!viewer) return { kind: "signin", href: loginHref };
    if (!membership) return { kind: "membership" };
    if (!inMyPlan) return { kind: "not-eligible" };
    if (windowEnd && new Date(session.starts_at) > windowEnd) return { kind: "outside-window" };
    return {
      kind: "book",
      dialog: {
        sessionId: session.id,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        activityTitle: localized(session.activity.title, locale),
        venueName: name,
        venueAddress: address,
        timeZone: tz,
        freeCancellationMinutes: membership.free_cancellation_minutes,
        visitsAvailable: membership.available,
      },
    };
  };

  return (
    <div className="container-page py-4">
      <Link
        href="/explore"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("nav.explore")}
      </Link>

      <section aria-label={t("venue.gallery")} className="grid gap-2 sm:grid-cols-3">
        <VenueImage
          path={images[0]?.storage_path}
          alt={localized(images[0]?.alt as LocalizedText, locale) || name}
          category={categories[0]?.slug}
          priority
          className="aspect-[16/10] w-full rounded-2xl sm:col-span-2 sm:row-span-2 sm:aspect-auto sm:min-h-72"
          sizes="(min-width: 640px) 66vw, 100vw"
        />
        {images.slice(1, 3).map((image) => (
          <VenueImage
            key={image.storage_path}
            path={image.storage_path}
            alt={localized(image.alt as LocalizedText, locale) || name}
            className="hidden aspect-[4/3] w-full rounded-2xl sm:block"
            sizes="33vw"
          />
        ))}
      </section>
      {venue.is_demo && images.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{t("demo.photo")}</p>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-8 lg:col-span-2">
          <header className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-2">
                {venue.is_demo ? (
                  <Badge variant="demo" className="w-fit">
                    {t("demo.badge")}
                  </Badge>
                ) : null}
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="size-4 shrink-0" aria-hidden="true" />
                  {district} · {address}
                </p>
              </div>
              <FavoriteButton venueId={venue.id} initial={favorite} signedIn={Boolean(viewer)} loginHref={loginHref} />
            </div>
            <ul className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const Icon = categoryIcon(category.slug);
                return (
                  <li key={category.slug}>
                    <Badge variant="secondary" className="text-sm">
                      <Icon aria-hidden="true" />
                      {localized(category.name, locale)}
                    </Badge>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {membership ? (
                <Badge variant={inMyPlan ? "success" : "outline"}>
                  {inMyPlan ? t("venue.includedInYourPlan") : t("venue.notIncludedInYourPlan")}
                </Badge>
              ) : null}
              {plans.length > 0 ? (
                <span className="text-muted-foreground">
                  {t("venue.includedIn")}:{" "}
                  {plans.map((plan, i) => (
                    <span key={plan.id}>
                      {i > 0 ? " · " : ""}
                      <Link
                        href={`/plans#plan-${plan.code}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {localized(plan.name, locale)}
                      </Link>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-muted-foreground">{t("venue.notInAnyPlan")}</span>
              )}
            </div>
          </header>

          <section id="sessions" aria-labelledby="sessions-heading" className="scroll-mt-24">
            <h2 id="sessions-heading" className="mb-3 text-xl font-semibold">
              {t("venue.sessions")}
            </h2>
            <nav aria-label={t("venue.chooseDay")} className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <ul className="flex gap-2">
                {days.map((day) => {
                  const active = day.value === selectedDate;
                  return (
                    <li key={day.value}>
                      <Link
                        href={`/venues/${venue.slug}?date=${day.value}#sessions`}
                        scroll={false}
                        aria-current={active ? "date" : undefined}
                        className={`flex min-h-14 min-w-16 flex-col items-center justify-center rounded-xl border px-3 py-1.5 text-sm ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card hover:border-primary"
                        }`}
                      >
                        <span className="text-xs">{day.weekday}</span>
                        <span className="font-semibold">{day.day}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <p className="mb-3 text-sm text-muted-foreground first-letter:uppercase">
              {formatDate(zonedTimeToUtc(selectedDate, "12:00", tz), locale, tz)}
            </p>
            <SessionList
              locale={locale}
              timeZone={tz}
              sessions={sessions.map((session) => ({
                id: session.id,
                startsAt: session.starts_at,
                endsAt: session.ends_at,
                title: localized(session.activity.title, locale),
                kind: session.activity.kind,
                capacity: session.capacity,
                occupied: session.occupied_count,
                cancellationReason: session.cancellation_reason,
                action: actionFor(session),
              }))}
            />
            <p className="mt-3 text-xs text-muted-foreground">{t("common.timezoneNote", { zone: "GMT+5" })}</p>
          </section>

          {localized(venue.description, locale) ? (
            <section aria-labelledby="about-heading">
              <h2 id="about-heading" className="mb-2 text-xl font-semibold">
                {t("venue.about")}
              </h2>
              <p className="whitespace-pre-line text-foreground/90">{localized(venue.description, locale)}</p>
            </section>
          ) : null}

          {localized(venue.rules, locale) ? (
            <section aria-labelledby="rules-heading">
              <h2 id="rules-heading" className="mb-2 text-xl font-semibold">
                {t("venue.rules")}
              </h2>
              <p className="whitespace-pre-line text-foreground/90">{localized(venue.rules, locale)}</p>
            </section>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2 text-base">
                <Clock className="size-4 text-primary" aria-hidden="true" />
                {t("venue.hours")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {hours.map((h) => (
                    <tr
                      key={h.weekday}
                      className={h.weekday === todayWeekday ? "font-semibold text-foreground" : "text-muted-foreground"}
                    >
                      <th scope="row" className="py-1 text-left font-[inherit] capitalize">
                        {formatDate(zonedTimeToUtc(`2024-01-0${h.weekday}`, "12:00", tz), locale, tz, {
                          weekday: "long",
                        })}
                        {h.weekday === todayWeekday ? (
                          <span className="sr-only"> ({t("venue.todayLabel")})</span>
                        ) : null}
                      </th>
                      <td className="py-1 text-right tabular-nums">
                        {h.is_closed || !h.opens_at || !h.closes_at
                          ? t("venue.closed")
                          : `${h.opens_at.slice(0, 5)}–${h.closes_at.slice(0, 5)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {amenities.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle as="h2" className="text-base">
                  {t("venue.amenities")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid grid-cols-2 gap-2 text-sm">
                  {amenities.map((amenity) => {
                    const Icon = amenityIcon(amenity.slug);
                    return (
                      <li key={amenity.slug} className="flex items-center gap-2">
                        <Icon className="size-4 text-primary" aria-hidden="true" />
                        {localized(amenity.name, locale)}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="text-base">
                {t("venue.address")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p>{address}</p>
              {venue.contact_phone ? (
                <p className="flex items-center gap-2">
                  <Phone className="size-4 text-primary" aria-hidden="true" />
                  <a href={`tel:${venue.contact_phone}`} className="hover:underline">
                    {formatPhone(venue.contact_phone)}
                  </a>
                </p>
              ) : null}
              {venue.latitude != null && venue.longitude != null ? (
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${venue.latitude}&mlon=${venue.longitude}#map=16/${venue.latitude}/${venue.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink aria-hidden="true" />
                    {t("venue.openMap")}
                  </a>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
