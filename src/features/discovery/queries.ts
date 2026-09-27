import "server-only";
import { cache } from "react";
import type { Locale } from "@/lib/i18n/routing";
import { DEFAULT_TIMEZONE } from "@/lib/i18n/routing";
import type { LocalizedText } from "@/lib/localized";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { localDayRange } from "@/lib/time";

export const PAGE_SIZE = 12;

export interface ExploreFilters {
  q?: string;
  city?: string;
  district?: string;
  category?: string;
  date?: string;
  plan?: string;
  near?: { lat: number; lng: number };
  page: number;
}

export type VenueCardData = Database["public"]["Functions"]["search_venues"]["Returns"][number];

export class QueryError extends Error {
  constructor(readonly code: string | undefined) {
    super(`Query failed${code ? ` (${code})` : ""}`);
    this.name = "QueryError";
  }
}

export async function searchVenues(filters: ExploreFilters, locale: Locale) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_venues", {
    p_query: filters.q || undefined,
    p_city: filters.city || undefined,
    p_district: filters.district || undefined,
    p_category: filters.category || undefined,
    p_date: filters.date || undefined,
    p_plan: filters.plan || undefined,
    p_lat: filters.near?.lat,
    p_lng: filters.near?.lng,
    p_locale: locale,
    p_limit: PAGE_SIZE,
    p_offset: (filters.page - 1) * PAGE_SIZE,
  });
  if (error) {
    throw new QueryError(error.code);
  }
  const items = data ?? [];
  return { items, total: items[0]?.total_count ?? 0 };
}

export const getFilterOptions = cache(async () => {
  const supabase = await createClient();
  const [cities, districts, categories, plans] = await Promise.all([
    supabase.from("cities").select("id, slug, name, timezone").eq("is_active", true).order("sort_order"),
    supabase.from("districts").select("id, slug, name, city_id").order("sort_order"),
    supabase.from("categories").select("id, slug, name, icon").order("sort_order"),
    supabase
      .from("plan_versions")
      .select("id, name, plan:plans!inner(code, sort_order, is_active)")
      .eq("status", "published"),
  ]);
  for (const result of [cities, districts, categories, plans]) {
    if (result.error) {
      throw new QueryError(result.error.code);
    }
  }
  return {
    cities: cities.data ?? [],
    districts: districts.data ?? [],
    categories: categories.data ?? [],
    plans: (plans.data ?? [])
      .filter((p) => p.plan.is_active)
      .sort((a, b) => a.plan.sort_order - b.plan.sort_order)
      .map((p) => ({ code: p.plan.code, name: p.name as LocalizedText })),
  };
});

export async function getVenueBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("venues")
    .select(
      `id, slug, name, description, address, rules, latitude, longitude, timezone, contact_phone, is_demo,
       publication_status, operational_status,
       district:districts!inner(slug, name, city:cities!inner(slug, name)),
       venue_categories(category:categories(slug, name, sort_order)),
       venue_amenities(amenity:amenities(slug, name, icon, sort_order)),
       venue_images(storage_path, alt, sort_order),
       venue_opening_hours(weekday, opens_at, closes_at, is_closed)`,
    )
    .eq("slug", slug)
    .eq("publication_status", "published")
    .eq("operational_status", "active")
    .maybeSingle();
  if (error) {
    throw new QueryError(error.code);
  }
  return data;
}

export type VenueDetail = NonNullable<Awaited<ReturnType<typeof getVenueBySlug>>>;

/** Published plan versions that include this venue (visible to everyone). */
export async function getVenuePlans(venueId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_version_venues")
    .select("plan_version:plan_versions!inner(id, name, status, plan:plans!inner(code, sort_order))")
    .eq("venue_id", venueId)
    .eq("plan_version.status", "published");
  if (error) {
    throw new QueryError(error.code);
  }
  return (data ?? [])
    .map((row) => row.plan_version)
    .sort((a, b) => a.plan.sort_order - b.plan.sort_order)
    .map((pv) => ({ id: pv.id, code: pv.plan.code, name: pv.name as LocalizedText }));
}

export async function getVenueSessions(venueId: string, date: string, timeZone = DEFAULT_TIMEZONE) {
  const supabase = await createClient();
  const { start, end } = localDayRange(date, timeZone);
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, starts_at, ends_at, capacity, occupied_count, status, cancellation_reason, activity:activities!inner(id, title, kind, duration_minutes, description)",
    )
    .eq("venue_id", venueId)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at");
  if (error) {
    throw new QueryError(error.code);
  }
  return data ?? [];
}

export type VenueSession = Awaited<ReturnType<typeof getVenueSessions>>[number];

/** The viewer's live reservations among the given sessions, keyed by session id. */
export async function getMyLiveBookings(sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return new Map<string, string>();
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("id, session_id")
    .in("session_id", sessionIds)
    .in("state", ["confirmed", "checked_in"]);
  return new Map((data ?? []).map((b) => [b.session_id, b.id]));
}

export async function isFavorite(venueId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("favorites")
    .select("venue_id")
    .eq("venue_id", venueId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function getPublishedPlans() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_versions")
    .select(
      `id, name, description, price_minor, currency, duration_days, visit_allowance, daily_visit_limit,
       max_future_bookings, booking_window_days, free_cancellation_minutes, is_demo,
       plan:plans!inner(code, sort_order, is_active),
       plan_version_venues(venue:venues(slug, name))`,
    )
    .eq("status", "published");
  if (error) {
    throw new QueryError(error.code);
  }
  return (data ?? [])
    .filter((pv) => pv.plan.is_active)
    .sort((a, b) => a.plan.sort_order - b.plan.sort_order)
    .map((pv) => ({
      ...pv,
      // RLS hides unpublished venues, so only visible eligible venues are listed.
      venues: pv.plan_version_venues
        .map((pvv) => pvv.venue)
        .filter((venue): venue is { slug: string; name: LocalizedText } => venue !== null),
    }));
}

export type PublishedPlan = Awaited<ReturnType<typeof getPublishedPlans>>[number];

export const getMyMembership = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_membership").maybeSingle();
  return data ?? null;
});

export type MembershipSummary = NonNullable<Awaited<ReturnType<typeof getMyMembership>>>;
