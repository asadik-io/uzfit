import { isDateString } from "@/lib/time";
import type { ExploreFilters } from "./queries";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function single(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function slug(value: string | string[] | undefined): string | undefined {
  const v = single(value);
  return v && v.length <= 60 && SLUG.test(v) ? v : undefined;
}

export function parseNear(value: string | undefined): { lat: number; lng: number } | undefined {
  if (!value || !/^-?\d{1,2}(\.\d{1,6})?,-?\d{1,3}(\.\d{1,6})?$/.test(value)) {
    return undefined;
  }
  const [lat, lng] = value.split(",").map(Number) as [number, number];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : undefined;
}

/** Validates explore query parameters; anything malformed is ignored rather than trusted. */
export function parseExploreFilters(params: Record<string, string | string[] | undefined>): ExploreFilters {
  const q = single(params.q)?.slice(0, 80);
  const date = single(params.date);
  const page = Number.parseInt(single(params.page) ?? "1", 10);
  return {
    q,
    city: slug(params.city),
    district: slug(params.district),
    category: slug(params.category),
    plan: slug(params.plan),
    date: date && isDateString(date) ? date : undefined,
    near: parseNear(single(params.near)),
    page: Number.isFinite(page) && page >= 1 && page <= 100 ? page : 1,
  };
}
