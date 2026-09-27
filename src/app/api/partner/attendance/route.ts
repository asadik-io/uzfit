import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { QueryError } from "@/features/discovery/queries";
import { getAttendanceReport, reportRange } from "@/features/partner/report";
import { getViewer } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { isLocale, type Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import { createClient } from "@/lib/supabase/server";

function isoLocal(value: string | null, timeZone: string): string {
  if (!value) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/**
 * Attendance CSV for one venue and date range (managers of that venue only; enforced by the
 * database function). Contains only the member data needed for operations.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const venueId = z.guid().safeParse(params.get("venue"));
  const localeParam = params.get("locale");
  const locale: Locale = isLocale(localeParam) ? localeParam : "uz";
  const noStore = { "Cache-Control": "private, no-store" };
  if (!venueId.success) {
    return NextResponse.json({ error: "invalid_venue" }, { status: 400, headers: noStore });
  }
  if (!(await getViewer())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }
  const supabase = await createClient();
  const { data: venue } = await supabase.from("venues").select("slug, timezone").eq("id", venueId.data).maybeSingle();
  if (!venue) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: venue.timezone }).format(new Date());
  const range = reportRange(params.get("from"), params.get("to"), today);
  let rows;
  try {
    rows = await getAttendanceReport(venueId.data, range.from, range.to);
  } catch (error) {
    const forbidden = error instanceof QueryError && error.code === "P0001";
    return NextResponse.json(
      { error: forbidden ? "forbidden" : "failed" },
      { status: forbidden ? 403 : 500, headers: noStore },
    );
  }
  const t = await getTranslations({ locale });
  const csv = toCsv([
    [
      t("partner.reports.colDate"),
      t("partner.reports.colStart"),
      t("partner.reports.colActivity"),
      t("partner.reports.colMember"),
      t("partner.reports.colStatus"),
      t("partner.reports.colCheckedIn"),
      t("partner.reports.colBooking"),
    ],
    ...rows.map((row) => [
      row.local_date,
      isoLocal(row.session_starts_at, venue.timezone),
      localized(row.activity_title, locale),
      row.member_display_name,
      t(`bookingState.${row.booking_state}`),
      isoLocal(row.checked_in_at, venue.timezone),
      row.booking_id,
    ]),
  ]);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...noStore,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="uzfit-attendance-${venue.slug}-${range.from}-${range.to}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
