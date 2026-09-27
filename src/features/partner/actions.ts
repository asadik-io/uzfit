"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { normalizeScannedToken } from "@/lib/checkin";
import { type ActionResult, type DomainErrorCode, fail, isDomainErrorCode, toDomainError } from "@/lib/errors";
import { IMAGE_MIME, sniffImageType } from "@/lib/image-type";
import { normalizePhone } from "@/lib/phone";
import { logEvent, requestId } from "@/lib/request";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { isDateString } from "@/lib/time";
import { slugSchema, type VenueContent, venueContentSchema } from "./venue-content";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

interface DbError {
  code?: string;
  message?: string;
  details?: string;
}

/** Domain error plus the offending field reported by the database (INVALID_CONTENT detail). */
function dbFailure(error: DbError | null): { ok: false; error: DomainErrorCode; fieldErrors?: Record<string, string> } {
  const code = toDomainError(error);
  const field = error?.code === "P0001" && error.details ? error.details : null;
  return field && /^[a-z_]+$/.test(field) ? fail(code, { [field]: "invalid" }) : fail(code);
}

async function requireSignedIn(): Promise<boolean> {
  return Boolean(await getViewer());
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

export interface CheckinSuccess {
  memberName: string;
  activityTitle: unknown;
  sessionStartsAt: string;
  checkedInAt: string;
}

/**
 * Redeems a scanned or pasted member code for the selected venue. The database verifies the
 * token hash, expiry, single use, booking, membership, venue, time window, and the staff
 * member's venue authorization, then checks the member in atomically.
 */
export async function redeemCheckinAction(rawToken: string, venueId: string): Promise<ActionResult<CheckinSuccess>> {
  if (!z.guid().safeParse(venueId).success || typeof rawToken !== "string" || rawToken.length > 200) {
    return fail("VALIDATION_FAILED");
  }
  const token = normalizeScannedToken(rawToken);
  if (!token) {
    return fail("TOKEN_INVALID");
  }
  if (!(await requireSignedIn())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_checkin_token", { p_token: token, p_venue_id: venueId }).single();
  if (error || !data) {
    return fail(toDomainError(error));
  }
  if (!data.ok) {
    return fail(isDomainErrorCode(data.error_code) ? data.error_code : "UNEXPECTED_ERROR");
  }
  revalidatePath("/[locale]/partner", "layout");
  return {
    ok: true,
    data: {
      memberName: data.member_display_name ?? "",
      activityTitle: data.activity_title,
      sessionStartsAt: data.session_starts_at ?? "",
      checkedInAt: data.checked_in_at ?? "",
    },
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const createSessionsSchema = z.object({
  activityId: z.guid(),
  date: z.string().refine(isDateString),
  times: z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
    .min(1)
    .max(12),
  repeatWeeks: z.coerce.number().int().min(1).max(12),
  capacity: z.union([z.literal(""), z.coerce.number().int().min(1).max(500)]),
});

/** Creates dated sessions from local wall-clock times (interpreted in the venue timezone). */
export async function createSessionsAction(
  _prev: ActionResult<{ count: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ count: number }>> {
  const parsed = createSessionsSchema.safeParse({
    activityId: formData.get("activityId"),
    date: formData.get("date"),
    times: formData
      .getAll("times")
      .map(String)
      .filter((value) => value !== ""),
    repeatWeeks: formData.get("repeatWeeks") ?? 1,
    capacity: formData.get("capacity") ?? "",
  });
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return fail("VALIDATION_FAILED", field ? { [field]: "invalid" } : undefined);
  }
  const { activityId, date, times, repeatWeeks, capacity } = parsed.data;
  const starts = new Set<string>();
  for (let week = 0; week < repeatWeeks; week += 1) {
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    const day = new Date(Date.UTC(y, m - 1, d + week * 7)).toISOString().slice(0, 10);
    for (const time of times) {
      starts.add(`${day}T${time}:00`);
    }
  }
  if (starts.size > 60) {
    return fail("VALIDATION_FAILED", { times: "invalid" });
  }
  if (!(await requireSignedIn())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("partner_create_sessions", {
    p_activity_id: activityId,
    p_local_starts: [...starts].sort(),
    p_capacity: capacity === "" ? undefined : capacity,
  });
  if (error) {
    return dbFailure(error);
  }
  revalidatePath("/[locale]/partner", "layout");
  return { ok: true, data: { count: data?.length ?? 0 } };
}

const capacitySchema = z.object({ sessionId: z.guid(), capacity: z.coerce.number().int().min(1).max(500) });

export async function updateSessionCapacityAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = capacitySchema.safeParse({ sessionId: formData.get("sessionId"), capacity: formData.get("capacity") });
  if (!parsed.success) {
    return fail("VALIDATION_FAILED", { capacity: "invalid" });
  }
  if (!(await requireSignedIn())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("partner_update_session_capacity", {
    p_session_id: parsed.data.sessionId,
    p_capacity: parsed.data.capacity,
  });
  if (error) {
    return dbFailure(error);
  }
  revalidatePath("/[locale]/partner", "layout");
  return { ok: true };
}

const cancelSchema = z.object({ sessionId: z.guid(), reason: z.string().trim().min(3).max(500) });

/** Venue cancellation: releases confirmed reservations and notifies the affected members. */
export async function cancelSessionAction(
  sessionId: string,
  reason: string,
): Promise<ActionResult<{ released: number }>> {
  const parsed = cancelSchema.safeParse({ sessionId, reason });
  if (!parsed.success) {
    return fail("REASON_REQUIRED");
  }
  if (!(await requireSignedIn())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_session", {
    p_session_id: parsed.data.sessionId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return dbFailure(error);
  }
  revalidatePath("/[locale]/partner", "layout");
  return { ok: true, data: { released: data ?? 0 } };
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

const localizedInput = (max: number) =>
  z.object({
    uz: z.string().trim().max(max),
    ru: z.string().trim().max(max),
    en: z.string().trim().max(max),
  });

function compactLocalized(value: { uz: string; ru: string; en: string }) {
  return Object.fromEntries(Object.entries(value).filter(([key, text]) => key === "uz" || text !== ""));
}

const activitySchema = z.object({
  title: localizedInput(120).refine((v) => v.uz !== "", "required"),
  description: localizedInput(2000),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  defaultCapacity: z.coerce.number().int().min(1).max(500),
});

function readActivity(formData: FormData) {
  const text = (name: string) => String(formData.get(name) ?? "");
  return {
    title: { uz: text("title.uz"), ru: text("title.ru"), en: text("title.en") },
    description: { uz: text("description.uz"), ru: text("description.ru"), en: text("description.en") },
    durationMinutes: formData.get("durationMinutes"),
    defaultCapacity: formData.get("defaultCapacity"),
  };
}

export async function createActivityAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const base = activitySchema.safeParse(readActivity(formData));
  const extra = z.object({ venueId: z.guid(), categoryId: z.guid(), kind: z.enum(["class", "open_gym"]) }).safeParse({
    venueId: formData.get("venueId"),
    categoryId: formData.get("categoryId"),
    kind: formData.get("kind"),
  });
  if (!base.success || !extra.success) {
    const issue =
      (base.success ? undefined : base.error.issues[0]) ?? (extra.success ? undefined : extra.error.issues[0]);
    return fail("VALIDATION_FAILED", { [String(issue?.path[0] ?? "form")]: "invalid" });
  }
  if (!(await requireSignedIn())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("partner_create_activity", {
    p_venue_id: extra.data.venueId,
    p_category_id: extra.data.categoryId,
    p_kind: extra.data.kind,
    p_title: compactLocalized(base.data.title),
    p_description: compactLocalized(base.data.description),
    p_duration_minutes: base.data.durationMinutes,
    p_default_capacity: base.data.defaultCapacity,
  });
  if (error) {
    return dbFailure(error);
  }
  revalidatePath("/[locale]/partner", "layout");
  return { ok: true };
}

export async function updateActivityAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const base = activitySchema.safeParse(readActivity(formData));
  const id = z.guid().safeParse(formData.get("activityId"));
  if (!base.success || !id.success) {
    const issue = base.success ? undefined : base.error.issues[0];
    return fail("VALIDATION_FAILED", { [String(issue?.path[0] ?? "form")]: "invalid" });
  }
  if (!(await requireSignedIn())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("partner_update_activity", {
    p_activity_id: id.data,
    p_title: compactLocalized(base.data.title),
    p_description: compactLocalized(base.data.description),
    p_duration_minutes: base.data.durationMinutes,
    p_default_capacity: base.data.defaultCapacity,
    p_is_active: formData.get("isActive") === "on",
  });
  if (error) {
    return dbFailure(error);
  }
  revalidatePath("/[locale]/partner", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Venues and drafts
// ---------------------------------------------------------------------------

function parseContent(
  content: unknown,
): { ok: true; data: VenueContent } | { ok: false; error: DomainErrorCode; fieldErrors?: Record<string, string> } {
  const parsed = venueContentSchema.safeParse(content);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail("VALIDATION_FAILED", { [String(issue?.path[0] ?? "content")]: "invalid" });
  }
  const data = parsed.data as VenueContent;
  if (data.contact_phone) {
    const phone = normalizePhone(data.contact_phone);
    if (!phone) {
      return fail("VALIDATION_FAILED", { contact_phone: "invalid" });
    }
    data.contact_phone = phone;
  }
  data.opening_hours = data.opening_hours.map((day) =>
    day.is_closed ? { weekday: day.weekday, is_closed: true } : day,
  );
  return { ok: true, data };
}

export async function createVenueAction(
  organizationId: string,
  slug: string,
  content: unknown,
): Promise<ActionResult<{ venueId: string }>> {
  if (!z.guid().safeParse(organizationId).success) {
    return fail("VALIDATION_FAILED");
  }
  const parsedSlug = slugSchema.safeParse(slug);
  if (!parsedSlug.success) {
    return fail("VALIDATION_FAILED", { slug: "invalid" });
  }
  const parsed = parseContent(content);
  if (!parsed.ok) {
    return parsed;
  }
  if (!(await requireSignedIn())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("partner_create_venue", {
    p_organization_id: organizationId,
    p_slug: parsedSlug.data,
    p_content: parsed.data as unknown as Json,
  });
  if (error || !data) {
    return dbFailure(error);
  }
  revalidatePath("/[locale]/partner", "layout");
  return { ok: true, data: { venueId: data } };
}

/** Saves the venue's single open draft and, when requested, submits it for admin approval. */
export async function saveVenueDraftAction(venueId: string, content: unknown, submit: boolean): Promise<ActionResult> {
  if (!z.guid().safeParse(venueId).success) {
    return fail("VALIDATION_FAILED");
  }
  const parsed = parseContent(content);
  if (!parsed.ok) {
    return parsed;
  }
  if (!(await requireSignedIn())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const saved = await supabase.rpc("partner_save_venue_revision", {
    p_venue_id: venueId,
    p_content: parsed.data as unknown as Json,
  });
  if (saved.error) {
    return dbFailure(saved.error);
  }
  if (submit) {
    const submitted = await supabase.rpc("partner_submit_venue_revision", { p_venue_id: venueId });
    if (submitted.error) {
      return dbFailure(submitted.error);
    }
  }
  revalidatePath("/[locale]/partner", "layout");
  return { ok: true };
}

export async function withdrawVenueDraftAction(venueId: string): Promise<ActionResult> {
  if (!z.guid().safeParse(venueId).success) {
    return fail("VALIDATION_FAILED");
  }
  if (!(await requireSignedIn())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("partner_withdraw_venue_revision", { p_venue_id: venueId });
  if (error) {
    return dbFailure(error);
  }
  revalidatePath("/[locale]/partner", "layout");
  return { ok: true };
}

/**
 * Uploads a venue photo into the venue's own storage folder. The content type is taken from
 * the file's bytes (JPEG, PNG, or WebP only), never from its name or declared type; Storage
 * policies additionally require a manager of that venue.
 */
export async function uploadVenueImageAction(formData: FormData): Promise<ActionResult<{ path: string }>> {
  const venueId = z.guid().safeParse(formData.get("venueId"));
  const file = formData.get("file");
  if (!venueId.success || !(file instanceof File)) {
    return fail("VALIDATION_FAILED");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return fail("UPLOAD_TOO_LARGE");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) {
    return fail("UPLOAD_INVALID_TYPE");
  }
  if (!(await requireSignedIn())) {
    return fail("AUTH_REQUIRED");
  }
  const path = `venues/${venueId.data}/${randomUUID()}.${type}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from("venue-media").upload(path, bytes, {
    contentType: IMAGE_MIME[type],
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    logEvent("warn", "partner.upload_failed", { requestId: await requestId(), message: error.message.slice(0, 120) });
    return fail("FORBIDDEN");
  }
  return { ok: true, data: { path } };
}
