import "server-only";
import type { LocalizedText } from "@/lib/localized";
import { emptyHours, type VenueContent, WEEKDAYS } from "./venue-content";

type EditableVenue = {
  name: unknown;
  address: unknown;
  description: unknown;
  rules: unknown;
  district_id: string;
  latitude: number | null;
  longitude: number | null;
  contact_phone: string | null;
  venue_categories: Array<{ category_id: string }>;
  venue_amenities: Array<{ amenity_id: string }>;
  venue_images: Array<{ storage_path: string; alt: unknown; sort_order: number }>;
  venue_opening_hours: Array<{
    weekday: number;
    opens_at: string | null;
    closes_at: string | null;
    is_closed: boolean;
  }>;
};

const hhmm = (value: string | null | undefined) => (value ? value.slice(0, 5) : undefined);

/** The live (published or draft-created) venue expressed as editable draft content. */
export function contentFromVenue(venue: EditableVenue): VenueContent {
  return {
    name: (venue.name ?? { uz: "" }) as LocalizedText,
    address: (venue.address ?? { uz: "" }) as LocalizedText,
    description: (venue.description ?? { uz: "" }) as LocalizedText,
    rules: (venue.rules ?? { uz: "" }) as LocalizedText,
    district_id: venue.district_id,
    latitude: venue.latitude,
    longitude: venue.longitude,
    contact_phone: venue.contact_phone,
    category_ids: venue.venue_categories.map((c) => c.category_id),
    amenity_ids: venue.venue_amenities.map((a) => a.amenity_id),
    images: [...venue.venue_images]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((image) => ({ path: image.storage_path, alt: (image.alt ?? { uz: "" }) as LocalizedText })),
    opening_hours: WEEKDAYS.map((weekday) => {
      const day = venue.venue_opening_hours.find((h) => h.weekday === weekday);
      return day && !day.is_closed
        ? { weekday, is_closed: false, opens_at: hhmm(day.opens_at), closes_at: hhmm(day.closes_at) }
        : { weekday, is_closed: true, opens_at: "08:00", closes_at: "22:00" };
    }),
  };
}

/** Draft content stored by the database (already validated there), normalized for the editor. */
export function contentFromRevision(raw: unknown): VenueContent | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const content = raw as Partial<VenueContent>;
  const hours = Array.isArray(content.opening_hours) ? content.opening_hours : emptyHours();
  return {
    name: content.name ?? { uz: "" },
    address: content.address ?? { uz: "" },
    description: content.description ?? { uz: "" },
    rules: content.rules ?? { uz: "" },
    district_id: content.district_id ?? "",
    latitude: content.latitude ?? null,
    longitude: content.longitude ?? null,
    contact_phone: content.contact_phone ?? null,
    category_ids: content.category_ids ?? [],
    amenity_ids: content.amenity_ids ?? [],
    images: content.images ?? [],
    opening_hours: WEEKDAYS.map((weekday) => {
      const day = hours.find((h) => h.weekday === weekday);
      return day && !day.is_closed
        ? { weekday, is_closed: false, opens_at: hhmm(day.opens_at), closes_at: hhmm(day.closes_at) }
        : { weekday, is_closed: true, opens_at: "08:00", closes_at: "22:00" };
    }),
  };
}

export function blankContent(): VenueContent {
  return {
    name: { uz: "" },
    address: { uz: "" },
    description: { uz: "" },
    rules: { uz: "" },
    district_id: "",
    latitude: null,
    longitude: null,
    contact_phone: null,
    category_ids: [],
    amenity_ids: [],
    images: [],
    opening_hours: emptyHours(),
  };
}
