import { CalendarRange, Check, Clock, Hourglass, ListChecks, MapPinned, Ticket } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PublishedPlan } from "@/features/discovery/queries";
import { formatMoney } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import { cn } from "@/lib/utils";

export async function PlanCard({
  plan,
  locale,
  current,
  hasActiveMembership,
}: {
  plan: PublishedPlan;
  locale: Locale;
  current: boolean;
  hasActiveMembership: boolean;
}) {
  const t = await getTranslations();
  const hours = plan.free_cancellation_minutes / 60;
  const cancellation = Number.isInteger(hours)
    ? t("common.hours", { count: hours })
    : t("common.minutes", { count: plan.free_cancellation_minutes });
  const rules = [
    {
      icon: Ticket,
      text: t("plans.visitAllowance", {
        visits: t("common.visits", { count: plan.visit_allowance }),
        days: t("common.days", { count: plan.duration_days }),
      }),
    },
    { icon: CalendarRange, text: t("plans.dailyLimit", { count: plan.daily_visit_limit }) },
    { icon: ListChecks, text: t("plans.futureBookings", { count: plan.max_future_bookings }) },
    {
      icon: Hourglass,
      text: t("plans.bookingWindow", { days: t("common.days", { count: plan.booking_window_days }) }),
    },
    { icon: Clock, text: t("plans.freeCancellation", { time: cancellation }) },
  ];

  return (
    <article
      id={`plan-${plan.plan.code}`}
      className={cn(
        "flex scroll-mt-24 flex-col gap-5 rounded-2xl border bg-card p-6 shadow-[var(--shadow-card)]",
        current ? "border-primary ring-2 ring-primary" : "border-border",
      )}
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{localized(plan.name, locale)}</h2>
          {current ? <Badge variant="success">{t("plans.currentPlan")}</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">{localized(plan.description, locale)}</p>
      </header>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-3xl font-extrabold tracking-tight">
          {formatMoney(plan.price_minor, locale, t("common.currency"))}
        </span>
        <span className="text-sm text-muted-foreground">/ {t("common.days", { count: plan.duration_days })}</span>
      </p>
      <ul className="flex flex-col gap-2.5 text-sm">
        {rules.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-2.5">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>
      <details className="group rounded-xl bg-muted p-3 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
          <MapPinned className="size-4 text-primary" aria-hidden="true" />
          {t("plans.venuesIncluded", { count: plan.venues.length })}
          <span className="ml-auto text-xs text-muted-foreground group-open:hidden">{t("plans.showVenues")}</span>
        </summary>
        <ul className="mt-3 flex flex-col gap-1.5">
          {plan.venues.map((venue) => (
            <li key={venue.slug} className="flex items-center gap-2">
              <Check className="size-3.5 text-primary" aria-hidden="true" />
              <Link href={`/venues/${venue.slug}`} className="hover:text-primary hover:underline">
                {localized(venue.name, locale)}
              </Link>
            </li>
          ))}
        </ul>
      </details>
      <div className="mt-auto">
        {hasActiveMembership ? (
          <Button className="w-full" variant="outline" disabled aria-disabled="true">
            {current ? t("plans.currentPlan") : t("plans.alreadyActive")}
          </Button>
        ) : (
          <Button asChild className="w-full" size="lg">
            <Link href={`/checkout/${plan.id}`}>{t("plans.choose")}</Link>
          </Button>
        )}
      </div>
    </article>
  );
}
