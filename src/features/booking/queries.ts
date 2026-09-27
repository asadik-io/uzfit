import "server-only";
import { QueryError } from "@/features/discovery/queries";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export const BOOKINGS_PAGE_SIZE = 10;

export type BookingScope = "upcoming" | "past";
export type BookingState = Database["public"]["Enums"]["booking_state"];
export type BookingListItem = Database["public"]["Functions"]["get_my_bookings"]["Returns"][number];

/** The member's reservations; the database derives the member from the verified session. */
export async function getMyBookings(scope: BookingScope, page: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_bookings", {
    p_scope: scope,
    p_limit: BOOKINGS_PAGE_SIZE,
    p_offset: (page - 1) * BOOKINGS_PAGE_SIZE,
  });
  if (error) {
    throw new QueryError(error.code);
  }
  const items = data ?? [];
  return { items, total: Number(items[0]?.total_count ?? 0) };
}

/** One of the member's own bookings, or null (another member's booking is indistinguishable from a missing one). */
export async function getMyBooking(bookingId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_booking", { p_booking_id: bookingId }).maybeSingle();
  if (error) {
    throw new QueryError(error.code);
  }
  return data;
}

export type BookingDetail = NonNullable<Awaited<ReturnType<typeof getMyBooking>>>;
