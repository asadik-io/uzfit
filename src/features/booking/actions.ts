"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { type ActionResult, fail, toDomainError } from "@/lib/errors";
import { logEvent, requestId } from "@/lib/request";
import { createClient } from "@/lib/supabase/server";

const bookInput = z.object({ sessionId: z.uuid(), idempotencyKey: z.uuid() });

/**
 * Reserves a session. The database derives the member from the verified JWT and re-checks every
 * rule under row locks; repeating the same idempotency key returns the original booking.
 */
export async function bookSessionAction(
  sessionId: string,
  idempotencyKey: string,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = bookInput.safeParse({ sessionId, idempotencyKey });
  if (!parsed.success) {
    return fail("VALIDATION_FAILED");
  }
  if (!(await getViewer())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_booking", { p_session_id: parsed.data.sessionId, p_idempotency_key: parsed.data.idempotencyKey })
    .single();
  if (error || !data) {
    const code = toDomainError(error);
    if (code === "UNEXPECTED_ERROR") {
      logEvent("error", "booking.create_failed", { requestId: await requestId(), code: error?.code });
    }
    return fail(code);
  }
  revalidatePath("/[locale]/bookings", "page");
  revalidatePath("/[locale]/membership", "page");
  return { ok: true, data: { bookingId: data.booking_id } };
}

const cancelInput = z.object({ bookingId: z.uuid(), acceptLate: z.boolean() });

/**
 * Cancels a booking. Timely cancellation releases the visit; after the deadline the member must
 * explicitly accept the late consequence, otherwise LATE_CANCELLATION_UNCONFIRMED is returned.
 */
export async function cancelBookingAction(
  bookingId: string,
  acceptLate: boolean,
): Promise<ActionResult<{ state: string }>> {
  const parsed = cancelInput.safeParse({ bookingId, acceptLate });
  if (!parsed.success) {
    return fail("VALIDATION_FAILED");
  }
  if (!(await getViewer())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("cancel_booking", { p_booking_id: parsed.data.bookingId, p_accept_late: parsed.data.acceptLate })
    .single();
  if (error || !data) {
    return fail(toDomainError(error));
  }
  revalidatePath("/[locale]/bookings", "page");
  revalidatePath("/[locale]/bookings/[id]", "page");
  revalidatePath("/[locale]/membership", "page");
  return { ok: true, data: { state: data.booking_state } };
}

const tokenInput = z.object({ bookingId: z.uuid() });

/** Issues a fresh 60-second check-in token for the member's own booking. */
export async function issueCheckinTokenAction(
  bookingId: string,
): Promise<ActionResult<{ token: string; expiresAt: string; serverNow: string }>> {
  const parsed = tokenInput.safeParse({ bookingId });
  if (!parsed.success) {
    return fail("VALIDATION_FAILED");
  }
  if (!(await getViewer())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_checkin_token", { p_booking_id: parsed.data.bookingId }).single();
  if (error || !data) {
    return fail(toDomainError(error));
  }
  return { ok: true, data: { token: data.token, expiresAt: data.expires_at, serverNow: new Date().toISOString() } };
}
