import { Bell, CalendarCheck, CalendarX, CircleCheck, CreditCard, UserX } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { MarkAllReadButton } from "@/features/notifications/mark-read-button";
import { requireViewer } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/notifications">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "notifications" });
  return { title: t("title"), robots: { index: false } };
}

const BOOKING_KEYS = [
  "booking_confirmed",
  "booking_cancelled",
  "booking_cancelled_late",
  "booking_venue_cancelled",
  "checkin_completed",
  "no_show_recorded",
] as const;
const MEMBERSHIP_KEYS = ["membership_activated", "membership_granted", "membership_revoked"] as const;
type BookingKey = (typeof BOOKING_KEYS)[number];
type MembershipKey = (typeof MEMBERSHIP_KEYS)[number];

const ICONS = {
  booking_confirmed: CalendarCheck,
  booking_cancelled: CalendarX,
  booking_cancelled_late: CalendarX,
  booking_venue_cancelled: CalendarX,
  checkin_completed: CircleCheck,
  no_show_recorded: UserX,
  membership_activated: CreditCard,
  membership_granted: CreditCard,
  membership_revoked: CreditCard,
} as const;

function param(params: unknown, key: string): unknown {
  return typeof params === "object" && params !== null && !Array.isArray(params)
    ? (params as Record<string, unknown>)[key]
    : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export default async function NotificationsPage({ params }: PageProps<"/[locale]/notifications">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireViewer(locale, `/${locale}/notifications`);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, message_key, params, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error("notifications_query_failed");
  }
  const t = await getTranslations();
  const items = data ?? [];
  const hasUnread = items.some((n) => !n.read_at);

  function render(key: string, p: unknown): { message: string; href: string | null } {
    if ((BOOKING_KEYS as readonly string[]).includes(key)) {
      const tz = text(param(p, "timezone")) || DEFAULT_TIMEZONE;
      const startsAt = text(param(p, "starts_at"));
      const values = {
        activity: localized(param(p, "activity_title"), locale),
        venue: localized(param(p, "venue_name"), locale),
        time: startsAt ? formatDateTime(startsAt, locale, tz, { dateStyle: "medium", timeStyle: "short" }) : "",
        reason: text(param(p, "reason")) || "—",
      };
      const bookingId = text(param(p, "booking_id"));
      return {
        message: t(`notifications.messages.${key as BookingKey}`, values),
        href: bookingId ? `/bookings/${bookingId}` : "/bookings",
      };
    }
    if ((MEMBERSHIP_KEYS as readonly string[]).includes(key)) {
      const released = Number(param(p, "released_bookings") ?? 0);
      return {
        message: t(`notifications.messages.${key as MembershipKey}`, {
          plan: localized(param(p, "plan_name"), locale),
          count: Number.isFinite(released) ? released : 0,
        }),
        href: "/membership",
      };
    }
    return { message: t("notifications.messages.generic"), href: null };
  }

  return (
    <div className="container-page flex max-w-3xl flex-col pb-8">
      <PageHeader
        title={t("notifications.title")}
        description={t("notifications.description")}
        actions={hasUnread ? <MarkAllReadButton /> : null}
      />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title={t("notifications.emptyTitle")} description={t("notifications.emptyText")} />
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {items.map((item) => {
            const { message, href } = render(item.message_key, item.params);
            const Icon = ICONS[item.message_key as keyof typeof ICONS] ?? Bell;
            const unread = !item.read_at;
            const body = (
              <>
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full",
                    unread ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  <Icon className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className={cn("text-sm", unread && "font-semibold")}>
                    {unread ? <span className="sr-only">{t("notifications.unread")}: </span> : null}
                    {message}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(item.created_at, locale, DEFAULT_TIMEZONE, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </span>
                {unread ? (
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                ) : null}
              </>
            );
            return (
              <li key={item.id}>
                {href ? (
                  <Link href={href} className="flex items-start gap-3 p-4 transition-colors hover:bg-muted">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 p-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
