import { ArrowLeft, CalendarClock, Clock, MapPin, QrCode, Ticket, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { RefreshAt } from "@/components/refresh-at";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingStateBadge } from "@/features/booking/booking-state-badge";
import { CancelBookingDialog } from "@/features/booking/cancel-booking-dialog";
import { CheckinQr } from "@/features/booking/checkin-qr";
import { getMyBooking } from "@/features/booking/queries";
import { requireViewer } from "@/lib/auth";
import { formatDate, formatDateTime, formatTime, formatTimeRange, timeZoneLabel } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";

export async function generateMetadata({ params }: PageProps<"/[locale]/bookings/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "bookingDetail" });
  return { title: t("title"), robots: { index: false } };
}

export default async function BookingDetailPage({ params, searchParams }: PageProps<"/[locale]/bookings/[id]">) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  setRequestLocale(locale);
  if (!z.guid().safeParse(id).success) {
    notFound();
  }
  const query = await searchParams;
  await requireViewer(locale, `/${locale}/bookings/${id}`);
  const booking = await getMyBooking(id);
  if (!booking) {
    notFound();
  }
  const t = await getTranslations();

  const tz = booking.venue_timezone;
  const now = new Date(booking.server_now).getTime();
  const startsAt = new Date(booking.session_starts_at).getTime();
  const endsAt = new Date(booking.session_ends_at).getTime();
  const deadline = new Date(booking.cancellation_deadline).getTime();
  const opensAt = new Date(booking.checkin_opens_at).getTime();
  const closesAt = new Date(booking.checkin_closes_at).getTime();
  const confirmed = booking.state === "confirmed";
  const sessionEnded = now >= endsAt;

  const venueName = localized(booking.venue_name, locale);
  const activity = localized(booking.activity_title, locale);
  const dateText = formatDate(booking.session_starts_at, locale, tz);
  const timeText = formatTimeRange(booking.session_starts_at, booking.session_ends_at, locale, tz);
  const zone = timeZoneLabel(booking.session_starts_at, locale, tz);
  const deadlineText = formatDateTime(booking.cancellation_deadline, locale, tz, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const at = (value: string | null) =>
    value ? formatDateTime(value, locale, tz, { dateStyle: "medium", timeStyle: "short" }) : "";

  return (
    <div className="container-page flex max-w-3xl flex-col gap-5 py-6">
      <RefreshAt
        serverNow={booking.server_now}
        times={
          confirmed
            ? [
                booking.cancellation_deadline,
                booking.checkin_opens_at,
                booking.session_starts_at,
                booking.checkin_closes_at,
              ]
            : []
        }
      />
      <Link
        href="/bookings"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("bookings.title")}
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <BookingStateBadge state={booking.state} sessionEnded={sessionEnded} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{activity}</h1>
        <p className="text-muted-foreground">
          <Link href={`/venues/${booking.venue_slug}`} className="font-medium text-foreground hover:underline">
            {venueName}
          </Link>
        </p>
      </header>

      {query.created === "1" && confirmed ? (
        <Alert variant="success" title={t("bookingDetail.createdTitle")}>
          {new Date(booking.created_at).getTime() > deadline
            ? t("bookingDetail.createdTextLate", { date: dateText, time: timeText, zone, venue: venueName })
            : t("bookingDetail.createdText", {
                date: dateText,
                time: timeText,
                zone,
                venue: venueName,
                deadline: deadlineText,
              })}
        </Alert>
      ) : null}

      {booking.state === "checked_in" ? (
        <Alert variant="success" title={t("bookingDetail.checkedInTitle")}>
          {t("bookingDetail.checkedInText", { time: at(booking.checked_in_at) })}
        </Alert>
      ) : null}
      {booking.state === "cancelled_on_time" ? (
        <Alert variant="info" title={t("bookingDetail.cancelledTitle")}>
          {t("bookingDetail.cancelledOnTimeText", { time: at(booking.cancelled_at) })}
        </Alert>
      ) : null}
      {booking.state === "cancelled_late" ? (
        <Alert variant="warning" title={t("bookingDetail.cancelledTitle")}>
          {booking.cancellation_source === "member"
            ? t("bookingDetail.cancelledLateText", { time: at(booking.cancelled_at) })
            : t("bookingDetail.cancelledByStaffLateText", { time: at(booking.cancelled_at) })}
        </Alert>
      ) : null}
      {booking.state === "venue_cancelled" ? (
        <Alert variant="warning" title={t("bookingDetail.venueCancelledTitle")}>
          {t("bookingDetail.venueCancelledText")}
          {booking.session_cancellation_reason || booking.cancellation_reason ? (
            <span className="mt-1 block">
              {t("common.reason")}: {booking.session_cancellation_reason || booking.cancellation_reason}
            </span>
          ) : null}
        </Alert>
      ) : null}
      {booking.state === "no_show" ? (
        <Alert variant="destructive" title={t("bookingDetail.noShowTitle")}>
          {t("bookingDetail.noShowText")}
        </Alert>
      ) : null}
      {confirmed && sessionEnded ? (
        <Alert variant="info" title={t("bookingDetail.awaitingTitle")}>
          {t("bookingDetail.awaitingText")}
        </Alert>
      ) : null}

      <Card>
        <CardContent className="pt-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="flex gap-3">
              <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <dt className="text-muted-foreground">{t("booking.when")}</dt>
                <dd className="font-semibold first-letter:uppercase">{dateText}</dd>
                <dd className="font-semibold tabular-nums">
                  {timeText} <span className="font-normal text-muted-foreground">({zone})</span>
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-muted-foreground">{t("booking.where")}</dt>
                <dd className="font-semibold">{venueName}</dd>
                <dd className="text-muted-foreground">{localized(booking.venue_address, locale)}</dd>
              </div>
            </div>
            <div className="flex gap-3">
              <Ticket className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <dt className="text-muted-foreground">{t("bookingDetail.plan")}</dt>
                <dd className="font-semibold">{localized(booking.plan_name, locale)}</dd>
              </div>
            </div>
            <div className="flex gap-3">
              <Clock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <dt className="text-muted-foreground">{t("bookingDetail.bookedAt")}</dt>
                <dd className="font-semibold">{at(booking.created_at)}</dd>
              </div>
            </div>
          </dl>
        </CardContent>
      </Card>

      {confirmed && !sessionEnded ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <QrCode className="size-5 text-primary" aria-hidden="true" />
              {t("checkin.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {now < opensAt ? (
              <p className="text-sm text-muted-foreground">
                {t("checkin.opensAt", {
                  time: at(booking.checkin_opens_at),
                  until: formatTime(booking.checkin_closes_at, locale, tz),
                })}
              </p>
            ) : now < closesAt ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("checkin.openText", { until: formatTime(booking.checkin_closes_at, locale, tz) })}
                </p>
                <CheckinQr bookingId={booking.booking_id} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("checkin.closedText", { time: at(booking.checkin_closes_at) })}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {confirmed && now < startsAt ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <XCircle className="size-5 text-primary" aria-hidden="true" />
              {t("cancel.sectionTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              {now <= deadline
                ? t("cancel.beforeDeadline", { time: deadlineText })
                : t("cancel.afterDeadline", { time: deadlineText })}
            </p>
            <CancelBookingDialog
              bookingId={booking.booking_id}
              deadline={booking.cancellation_deadline}
              timeZone={tz}
              serverNow={booking.server_now}
            />
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("bookings.timezoneNote")}</p>
    </div>
  );
}
