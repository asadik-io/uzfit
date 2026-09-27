import { CalendarX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { BookSessionDialog, type BookSessionDialogProps } from "@/features/booking/book-session-dialog";
import { formatTimeRange } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";

export type SessionAction =
  | { kind: "book"; dialog: BookSessionDialogProps }
  | { kind: "booked"; bookingId: string }
  | { kind: "signin"; href: string }
  | { kind: "membership" }
  | { kind: "not-eligible" }
  | { kind: "outside-window" }
  | { kind: "full" }
  | { kind: "cancelled" }
  | { kind: "started" };

export interface SessionListItem {
  id: string;
  startsAt: string;
  endsAt: string;
  title: string;
  kind: "class" | "open_gym";
  capacity: number;
  occupied: number;
  cancellationReason: string | null;
  action: SessionAction;
}

export async function SessionList({
  sessions,
  locale,
  timeZone,
}: {
  sessions: SessionListItem[];
  locale: Locale;
  timeZone: string;
}) {
  const t = await getTranslations();
  if (sessions.length === 0) {
    return <EmptyState icon={CalendarX} title={t("venue.noSessions")} className="py-8" />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {sessions.map((session) => {
        const left = Math.max(session.capacity - session.occupied, 0);
        const { action } = session;
        const muted = action.kind === "cancelled" || action.kind === "started";
        const kindLabel = session.kind === "class" ? t("venue.classKind") : t("venue.openGymKind");
        return (
          <li
            key={session.id}
            className={`flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center ${muted ? "opacity-70" : ""}`}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-base font-semibold tabular-nums">
                {formatTimeRange(session.startsAt, session.endsAt, locale, timeZone)}
              </p>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{session.title}</span>
                {kindLabel.toLocaleLowerCase(locale) !== session.title.toLocaleLowerCase(locale) ? (
                  <Badge variant="secondary">{kindLabel}</Badge>
                ) : null}
              </p>
              {action.kind === "cancelled" && session.cancellationReason ? (
                <p className="text-sm text-muted-foreground">{session.cancellationReason}</p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              {action.kind === "cancelled" ? (
                <Badge variant="destructive">{t("venue.cancelled")}</Badge>
              ) : action.kind === "started" ? (
                <Badge variant="secondary">{t("venue.started")}</Badge>
              ) : action.kind === "full" ? (
                <Badge variant="warning">{t("venue.full")}</Badge>
              ) : action.kind === "booked" ? (
                <Badge variant="success">{t("venue.booked")}</Badge>
              ) : (
                <span className="text-sm text-muted-foreground">{t("venue.spotsLeft", { count: left })}</span>
              )}
              {action.kind === "book" ? <BookSessionDialog {...action.dialog} /> : null}
              {action.kind === "booked" ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/bookings/${action.bookingId}`}>{t("venue.viewBooking")}</Link>
                </Button>
              ) : null}
              {action.kind === "signin" ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={action.href}>{t("venue.signInToBook")}</Link>
                </Button>
              ) : null}
              {action.kind === "membership" ? (
                <Button asChild size="sm" variant="accent">
                  <Link href="/plans">{t("venue.getMembership")}</Link>
                </Button>
              ) : null}
              {action.kind === "not-eligible" ? <Badge variant="outline">{t("venue.notInPlan")}</Badge> : null}
              {action.kind === "outside-window" ? <Badge variant="outline">{t("venue.outsideWindow")}</Badge> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
