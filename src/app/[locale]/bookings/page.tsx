import { CalendarCheck, CalendarClock, ChevronRight, History, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { BookingStateBadge } from "@/features/booking/booking-state-badge";
import { BOOKINGS_PAGE_SIZE, type BookingScope, getMyBookings } from "@/features/booking/queries";
import { getMyMembership } from "@/features/discovery/queries";
import { requireViewer } from "@/lib/auth";
import { formatDate, formatTimeRange } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import { renderTimeMs } from "@/lib/server-time";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/bookings">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "bookings" });
  return { title: t("title"), robots: { index: false } };
}

function parsePage(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page > 0 && page <= 1000 ? page : 1;
}

export default async function BookingsPage({ params, searchParams }: PageProps<"/[locale]/bookings">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const query = await searchParams;
  const scope: BookingScope = query.tab === "past" ? "past" : "upcoming";
  const page = parsePage(query.page);
  await requireViewer(locale, `/${locale}/bookings${scope === "past" ? "?tab=past" : ""}`);
  const t = await getTranslations();
  const [{ items, total }, membership] = await Promise.all([getMyBookings(scope, page), getMyMembership()]);
  const pages = Math.max(Math.ceil(total / BOOKINGS_PAGE_SIZE), 1);
  const now = renderTimeMs();

  const tabs = [
    { scope: "upcoming" as const, label: t("bookings.upcoming"), icon: CalendarClock, href: "/bookings" },
    { scope: "past" as const, label: t("bookings.past"), icon: History, href: "/bookings?tab=past" },
  ];

  return (
    <div className="container-page">
      <PageHeader
        title={t("bookings.title")}
        description={
          membership
            ? t("bookings.visitsSummary", {
                available: membership.available,
                total: membership.visit_allowance,
              })
            : t("bookings.description")
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/explore">{t("bookings.findSession")}</Link>
          </Button>
        }
      />
      <nav aria-label={t("bookings.title")} className="mb-5 inline-flex rounded-xl bg-muted p-1">
        {tabs.map((tab) => {
          const active = tab.scope === scope;
          return (
            <Link
              key={tab.scope}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground",
                active && "bg-card text-foreground shadow-sm",
              )}
            >
              <tab.icon className="size-4" aria-hidden="true" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={scope === "upcoming" ? t("bookings.emptyUpcomingTitle") : t("bookings.emptyPastTitle")}
          description={
            scope === "upcoming"
              ? membership
                ? t("bookings.emptyUpcomingText")
                : t("bookings.emptyNoMembershipText")
              : t("bookings.emptyPastText")
          }
          action={
            scope === "upcoming" ? (
              <Button asChild>
                <Link href={membership ? "/explore" : "/plans"}>
                  {membership ? t("bookings.findSession") : t("venue.getMembership")}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((booking) => {
            const timeZone = booking.venue_timezone;
            const ended = new Date(booking.session_ends_at).getTime() <= now;
            return (
              <li key={booking.booking_id}>
                <Link
                  href={`/bookings/${booking.booking_id}`}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary"
                >
                  <div
                    className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-primary-soft py-2 text-primary"
                    aria-hidden="true"
                  >
                    <span className="text-xs font-semibold uppercase">
                      {formatDate(booking.session_starts_at, locale, timeZone, { weekday: "short" })}
                    </span>
                    <span className="text-2xl leading-tight font-extrabold">
                      {formatDate(booking.session_starts_at, locale, timeZone, { day: "numeric" })}
                    </span>
                    <span className="text-xs">
                      {formatDate(booking.session_starts_at, locale, timeZone, { month: "short" })}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="font-semibold">
                      {localized(booking.activity_title, locale)}
                      <span className="sr-only">
                        {", "}
                        {formatDate(booking.session_starts_at, locale, timeZone)}
                      </span>
                    </p>
                    <p className="text-sm tabular-nums">
                      {formatTimeRange(booking.session_starts_at, booking.session_ends_at, locale, timeZone)}
                    </p>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{localized(booking.venue_name, locale)}</span>
                    </p>
                    <div>
                      <BookingStateBadge state={booking.state} sessionEnded={ended} />
                    </div>
                  </div>
                  <ChevronRight
                    className="size-5 shrink-0 text-muted-foreground group-hover:text-primary"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        page={page}
        pages={pages}
        pathname="/bookings"
        query={{ tab: scope === "past" ? "past" : undefined }}
      />
      <p className="pb-4 text-xs text-muted-foreground">{t("bookings.timezoneNote")}</p>
    </div>
  );
}
