import "server-only";
import { requireStaff } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/routing";
import { renderTimeMs } from "@/lib/server-time";
import { localDateString } from "@/lib/time";
import { getStaffVenues, selectVenue, type StaffVenue } from "./queries";

/**
 * Every partner page calls this (layouts alone are not re-checked on client navigation): it
 * requires an active staff member and resolves the selected venue from the viewer's own venues.
 */
export async function partnerContext(locale: Locale, path: string, venueParam: string | string[] | undefined) {
  const { viewer, access } = await requireStaff(locale, path);
  const venues = await getStaffVenues(access);
  const venue = selectVenue(venues, venueParam);
  const managerOrgs = access.organizations.filter((o) => o.status === "active" && o.role === "manager");
  return { viewer, access, venues, venue, managerOrgs };
}

/** Today's calendar date in the venue's timezone. */
export function venueToday(venue: StaffVenue): string {
  return localDateString(new Date(renderTimeMs()), venue.timezone);
}
