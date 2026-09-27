import "server-only";
import { cache } from "react";
import { QueryError } from "@/features/discovery/queries";
import type { Access } from "@/lib/auth";
import type { LocalizedText } from "@/lib/localized";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type OrgRole = Database["public"]["Enums"]["org_role"];

export interface StaffVenue {
  id: string;
  slug: string;
  name: LocalizedText;
  timezone: string;
  publicationStatus: Database["public"]["Enums"]["venue_publication_status"];
  operationalStatus: Database["public"]["Enums"]["venue_operational_status"];
  organizationId: string;
  organizationName: string;
  role: OrgRole;
}

/** Venues of the organizations the viewer actively staffs, with the viewer's role for each. */
export const getStaffVenues = cache(async (access: Access): Promise<StaffVenue[]> => {
  const orgs = access.organizations.filter((o) => o.status === "active");
  if (orgs.length === 0) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("venues")
    .select("id, slug, name, timezone, publication_status, operational_status, organization_id")
    .in(
      "organization_id",
      orgs.map((o) => o.id),
    )
    .order("slug");
  if (error) {
    throw new QueryError(error.code);
  }
  const byId = new Map(orgs.map((o) => [o.id, o]));
  return (data ?? []).map((v) => ({
    id: v.id,
    slug: v.slug,
    name: v.name as LocalizedText,
    timezone: v.timezone,
    publicationStatus: v.publication_status,
    operationalStatus: v.operational_status,
    organizationId: v.organization_id,
    organizationName: byId.get(v.organization_id)?.name ?? "",
    role: byId.get(v.organization_id)?.role ?? "receptionist",
  }));
});

/** The venue selected by ?venue= (or the first one), limited to the viewer's own venues. */
export function selectVenue(venues: StaffVenue[], requested: string | string[] | undefined): StaffVenue | null {
  const id = Array.isArray(requested) ? requested[0] : requested;
  return venues.find((v) => v.id === id) ?? venues[0] ?? null;
}

export type DaySession = Database["public"]["Functions"]["partner_day_sessions"]["Returns"][number];

export async function getDaySessions(venueId: string, date: string): Promise<DaySession[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("partner_day_sessions", { p_venue_id: venueId, p_date: date });
  if (error) {
    throw new QueryError(error.code);
  }
  return data ?? [];
}

export async function getSessionWithRoster(sessionId: string) {
  const supabase = await createClient();
  const [session, roster] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        "id, venue_id, starts_at, ends_at, capacity, occupied_count, status, cancellation_reason, cancelled_at, activity:activities!inner(id, title, kind)",
      )
      .eq("id", sessionId)
      .maybeSingle(),
    supabase.rpc("get_session_roster", { p_session_id: sessionId }),
  ]);
  if (session.error) {
    throw new QueryError(session.error.code);
  }
  if (roster.error) {
    // FORBIDDEN for sessions of other organizations: indistinguishable from a missing session.
    return null;
  }
  return session.data ? { session: session.data, roster: roster.data ?? [] } : null;
}

export async function getActivities(venueId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .select(
      "id, title, description, kind, duration_minutes, default_capacity, is_active, category:categories(id, slug, name)",
    )
    .eq("venue_id", venueId)
    .order("created_at");
  if (error) {
    throw new QueryError(error.code);
  }
  return data ?? [];
}

export type PartnerActivity = Awaited<ReturnType<typeof getActivities>>[number];

export const getReferenceData = cache(async () => {
  const supabase = await createClient();
  const [districts, categories, amenities] = await Promise.all([
    supabase.from("districts").select("id, slug, name, city:cities(name)").order("sort_order"),
    supabase.from("categories").select("id, slug, name").order("sort_order"),
    supabase.from("amenities").select("id, slug, name").order("sort_order"),
  ]);
  for (const result of [districts, categories, amenities]) {
    if (result.error) {
      throw new QueryError(result.error.code);
    }
  }
  return {
    districts: (districts.data ?? []).map((d) => ({ id: d.id, name: d.name as LocalizedText })),
    categories: (categories.data ?? []).map((c) => ({ id: c.id, slug: c.slug, name: c.name as LocalizedText })),
    amenities: (amenities.data ?? []).map((a) => ({ id: a.id, slug: a.slug, name: a.name as LocalizedText })),
  };
});

/** Live venue content plus the latest revision, for the draft editor (managers only by RLS). */
export async function getVenueForEditing(venueId: string) {
  const supabase = await createClient();
  const [venue, revisions] = await Promise.all([
    supabase
      .from("venues")
      .select(
        `id, slug, organization_id, name, description, address, rules, district_id, latitude, longitude,
         contact_phone, publication_status, operational_status,
         venue_categories(category_id), venue_amenities(amenity_id),
         venue_images(storage_path, alt, sort_order),
         venue_opening_hours(weekday, opens_at, closes_at, is_closed)`,
      )
      .eq("id", venueId)
      .maybeSingle(),
    supabase
      .from("venue_revisions")
      .select("id, status, content, submitted_at, reviewed_at, review_note, updated_at")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (venue.error) {
    throw new QueryError(venue.error.code);
  }
  if (revisions.error) {
    throw new QueryError(revisions.error.code);
  }
  return venue.data ? { venue: venue.data, latestRevision: revisions.data?.[0] ?? null } : null;
}
