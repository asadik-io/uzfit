import { z } from "zod";
import type { LocalizedText } from "@/lib/localized";

/**
 * Venue draft content exchanged between the editor, the Server Actions, and the database
 * (private.validate_venue_content re-validates every field, including ownership of image paths).
 */
export interface VenueContent {
  name: LocalizedText;
  address: LocalizedText;
  description: LocalizedText;
  rules: LocalizedText;
  district_id: string;
  latitude: number | null;
  longitude: number | null;
  contact_phone: string | null;
  category_ids: string[];
  amenity_ids: string[];
  images: Array<{ path: string; alt: LocalizedText }>;
  opening_hours: Array<{ weekday: number; is_closed: boolean; opens_at?: string; closes_at?: string }>;
}

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function localizedText(max: number, requireUz: boolean) {
  return z
    .object({ uz: z.string().optional(), ru: z.string().optional(), en: z.string().optional() })
    .transform((value) => {
      const out: LocalizedText = {};
      for (const key of ["uz", "ru", "en"] as const) {
        const text = value[key]?.trim();
        if (text) {
          out[key] = text;
        }
      }
      if (!out.uz) {
        out.uz = "";
      }
      return out;
    })
    .refine((value) => Object.values(value).every((text) => (text ?? "").length <= max), "tooLong")
    .refine((value) => !requireUz || (value.uz ?? "").length > 0, "required");
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/);

export const venueContentSchema = z
  .object({
    name: localizedText(120, true),
    address: localizedText(300, true),
    description: localizedText(4000, false),
    rules: localizedText(4000, false),
    district_id: z.guid(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    contact_phone: z.string().max(20).nullable(),
    category_ids: z.array(z.guid()).min(1).max(6),
    amenity_ids: z.array(z.guid()).max(20),
    images: z.array(z.object({ path: z.string().max(200), alt: localizedText(200, false) })).max(12),
    opening_hours: z
      .array(
        z.object({
          weekday: z.number().int().min(1).max(7),
          is_closed: z.boolean(),
          opens_at: time.optional(),
          closes_at: time.optional(),
        }),
      )
      .length(7),
  })
  .refine((value) => (value.latitude === null) === (value.longitude === null), {
    message: "coordinates",
    path: ["latitude"],
  });

export function emptyHours(): VenueContent["opening_hours"] {
  return WEEKDAYS.map((weekday) => ({ weekday, is_closed: false, opens_at: "08:00", closes_at: "22:00" }));
}

export const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
