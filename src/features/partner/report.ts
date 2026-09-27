import "server-only";
import { QueryError } from "@/features/discovery/queries";
import { createClient } from "@/lib/supabase/server";
import { addDays, isDateString } from "@/lib/time";

export const MAX_REPORT_DAYS = 93;

/** Validated inclusive local-date range, defaulting to the last 30 days. */
export function reportRange(from: unknown, to: unknown, today: string): { from: string; to: string } {
  const end = typeof to === "string" && isDateString(to) ? to : today;
  const start = typeof from === "string" && isDateString(from) ? from : addDays(end, -29);
  if (start > end) {
    return { from: end, to: end };
  }
  const earliest = addDays(end, -(MAX_REPORT_DAYS - 1));
  return { from: start < earliest ? earliest : start, to: end };
}

export async function getAttendanceReport(venueId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("partner_attendance_report", {
    p_venue_id: venueId,
    p_from: from,
    p_to: to,
  });
  if (error) {
    throw new QueryError(error.code);
  }
  return data ?? [];
}
