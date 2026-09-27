"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { type ActionResult, type DomainErrorCode, fail, toDomainError } from "@/lib/errors";
import { logEvent, requestId } from "@/lib/request";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin Server Actions. Each one validates its input and calls a database function that
 * re-checks the admin role, the second factor (when required), the mandatory reason, and writes
 * the audit entry in the same transaction. The UI never decides authorization.
 */

type Result = ActionResult;

const reason = z.string().trim().min(3).max(500);
const id = z.guid();

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function run(
  rpc: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ error: { code?: string; message?: string } | null }>,
): Promise<Result> {
  if (!(await getViewer())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { error } = await rpc(supabase);
  if (error) {
    const code: DomainErrorCode = toDomainError(error);
    if (code === "UNEXPECTED_ERROR") {
      logEvent("error", "admin.action_failed", { requestId: await requestId(), code: error.code });
    }
    return fail(code);
  }
  revalidatePath("/[locale]/admin", "layout");
  return { ok: true };
}

function invalid(field: string): Result {
  return fail(field === "reason" ? "REASON_REQUIRED" : "VALIDATION_FAILED", { [field]: "invalid" });
}

// ---------------------------------------------------------------------------
// Venues and revisions
// ---------------------------------------------------------------------------

export async function setVenueStatusAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z
    .object({
      venueId: id,
      action: z.enum(["publish", "unpublish", "suspend", "reinstate"]),
      reason: z.string().trim().max(500),
      cancelFuture: z.boolean(),
    })
    .safeParse({
      venueId: text(formData, "venueId"),
      action: text(formData, "action"),
      reason: text(formData, "reason"),
      cancelFuture: formData.get("cancelFuture") === "on",
    });
  if (!parsed.success) {
    return invalid(String(parsed.error.issues[0]?.path[0] ?? "form"));
  }
  const needsReason = parsed.data.action === "unpublish" || parsed.data.action === "suspend";
  if (needsReason && !reason.safeParse(parsed.data.reason).success) {
    return invalid("reason");
  }
  return run((supabase) =>
    supabase.rpc("admin_set_venue_status", {
      p_venue_id: parsed.data.venueId,
      p_action: parsed.data.action,
      p_reason: parsed.data.reason || undefined,
      p_cancel_future_sessions: parsed.data.cancelFuture,
    }),
  );
}

export async function reviewRevisionAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z
    .object({ revisionId: id, decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500) })
    .safeParse({
      revisionId: text(formData, "revisionId"),
      decision: text(formData, "decision"),
      note: text(formData, "note"),
    });
  if (!parsed.success) {
    return invalid(String(parsed.error.issues[0]?.path[0] ?? "form"));
  }
  if (parsed.data.decision === "reject" && !reason.safeParse(parsed.data.note).success) {
    return fail("REASON_REQUIRED", { note: "invalid" });
  }
  return run((supabase) =>
    supabase.rpc("admin_review_venue_revision", {
      p_revision_id: parsed.data.revisionId,
      p_approve: parsed.data.decision === "approve",
      p_note: parsed.data.note || undefined,
    }),
  );
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export async function createOrganizationAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z
    .object({ name: z.string().trim().min(2).max(120), isDemo: z.boolean() })
    .safeParse({ name: text(formData, "name"), isDemo: formData.get("isDemo") === "on" });
  if (!parsed.success) {
    return invalid("name");
  }
  return run((supabase) =>
    supabase.rpc("admin_create_organization", { p_name: parsed.data.name, p_is_demo: parsed.data.isDemo }),
  );
}

export async function setOrganizationStatusAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z.object({ organizationId: id, status: z.enum(["active", "suspended"]), reason }).safeParse({
    organizationId: text(formData, "organizationId"),
    status: text(formData, "status"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) {
    return invalid(String(parsed.error.issues[0]?.path[0] ?? "form"));
  }
  return run((supabase) =>
    supabase.rpc("admin_set_organization_status", {
      p_organization_id: parsed.data.organizationId,
      p_status: parsed.data.status,
      p_reason: parsed.data.reason,
    }),
  );
}

export async function setOrgMemberAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z.object({ organizationId: id, userId: id, role: z.enum(["manager", "receptionist"]) }).safeParse({
    organizationId: text(formData, "organizationId"),
    userId: text(formData, "userId"),
    role: text(formData, "role"),
  });
  if (!parsed.success) {
    return invalid(String(parsed.error.issues[0]?.path[0] ?? "form"));
  }
  return run((supabase) =>
    supabase.rpc("admin_set_org_member", {
      p_organization_id: parsed.data.organizationId,
      p_user_id: parsed.data.userId,
      p_role: parsed.data.role,
    }),
  );
}

export async function removeOrgMemberAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z
    .object({ organizationId: id, userId: id })
    .safeParse({ organizationId: text(formData, "organizationId"), userId: text(formData, "userId") });
  if (!parsed.success) {
    return invalid("form");
  }
  return run((supabase) =>
    supabase.rpc("admin_remove_org_member", {
      p_organization_id: parsed.data.organizationId,
      p_user_id: parsed.data.userId,
    }),
  );
}

// ---------------------------------------------------------------------------
// Users and memberships
// ---------------------------------------------------------------------------

export async function setAccountStatusAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z.object({ userId: id, status: z.enum(["active", "suspended"]), reason }).safeParse({
    userId: text(formData, "userId"),
    status: text(formData, "status"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) {
    return invalid(String(parsed.error.issues[0]?.path[0] ?? "form"));
  }
  return run((supabase) =>
    supabase.rpc("admin_set_account_status", {
      p_user_id: parsed.data.userId,
      p_status: parsed.data.status,
      p_reason: parsed.data.reason,
    }),
  );
}

/**
 * Anonymization per the documented retention process: the database scrubs profile data,
 * revokes access, and keeps booking/attendance/payment records; the Auth user is then
 * soft-deleted so the email address can no longer sign in.
 */
export async function anonymizeUserAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z.object({ userId: id, reason, confirm: z.literal("on") }).safeParse({
    userId: text(formData, "userId"),
    reason: text(formData, "reason"),
    confirm: text(formData, "confirm"),
  });
  if (!parsed.success) {
    return invalid(String(parsed.error.issues[0]?.path[0] ?? "form"));
  }
  if (!hasAdminClient()) {
    return fail("CONFIGURATION_REQUIRED");
  }
  const result = await run((supabase) =>
    supabase.rpc("admin_anonymize_user", { p_user_id: parsed.data.userId, p_reason: parsed.data.reason }),
  );
  if (!result.ok) {
    return result;
  }
  const { error } = await createAdminClient().auth.admin.deleteUser(parsed.data.userId, true);
  if (error) {
    logEvent("error", "admin.auth_soft_delete_failed", { requestId: await requestId(), status: error.status });
    return fail("UNEXPECTED_ERROR");
  }
  return { ok: true };
}

export async function grantMembershipAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z.object({ userId: id, planVersionId: id, reason }).safeParse({
    userId: text(formData, "userId"),
    planVersionId: text(formData, "planVersionId"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) {
    return invalid(String(parsed.error.issues[0]?.path[0] ?? "form"));
  }
  return run((supabase) =>
    supabase.rpc("admin_grant_membership", {
      p_user_id: parsed.data.userId,
      p_plan_version_id: parsed.data.planVersionId,
      p_reason: parsed.data.reason,
    }),
  );
}

export async function revokeMembershipAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z
    .object({ membershipId: id, reason })
    .safeParse({ membershipId: text(formData, "membershipId"), reason: text(formData, "reason") });
  if (!parsed.success) {
    return invalid(String(parsed.error.issues[0]?.path[0] ?? "form"));
  }
  return run((supabase) =>
    supabase.rpc("admin_revoke_membership", {
      p_membership_id: parsed.data.membershipId,
      p_reason: parsed.data.reason,
    }),
  );
}

export async function correctBookingAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z.object({ bookingId: id, newState: z.enum(["checked_in", "cancelled_on_time"]), reason }).safeParse({
    bookingId: text(formData, "bookingId"),
    newState: text(formData, "newState"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) {
    return invalid(String(parsed.error.issues[0]?.path[0] ?? "form"));
  }
  return run((supabase) =>
    supabase.rpc("admin_correct_booking", {
      p_booking_id: parsed.data.bookingId,
      p_new_state: parsed.data.newState,
      p_reason: parsed.data.reason,
    }),
  );
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function createPlanAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z
    .object({
      code: z
        .string()
        .trim()
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        .max(40),
      sortOrder: z.coerce.number().int().min(0).max(1000),
    })
    .safeParse({ code: text(formData, "code"), sortOrder: text(formData, "sortOrder") || 0 });
  if (!parsed.success) {
    return invalid(String(parsed.error.issues[0]?.path[0] ?? "form"));
  }
  return run((supabase) =>
    supabase.rpc("admin_create_plan", { p_code: parsed.data.code, p_sort_order: parsed.data.sortOrder }),
  );
}

const planTermsSchema = z.object({
  planId: id,
  nameUz: z.string().trim().min(1).max(120),
  nameRu: z.string().trim().max(120),
  nameEn: z.string().trim().max(120),
  descriptionUz: z.string().trim().max(1000),
  descriptionRu: z.string().trim().max(1000),
  descriptionEn: z.string().trim().max(1000),
  /** Whole so'm as entered by the admin; stored in tiyin (minor units). */
  priceSom: z.coerce.number().int().min(0).max(100_000_000),
  durationDays: z.coerce.number().int().min(1).max(366),
  visitAllowance: z.coerce.number().int().min(1).max(1000),
  dailyVisitLimit: z.coerce.number().int().min(1).max(10),
  maxFutureBookings: z.coerce.number().int().min(1).max(50),
  bookingWindowDays: z.coerce.number().int().min(1).max(60),
  freeCancellationMinutes: z.coerce.number().int().min(0).max(10_080),
  isDemo: z.boolean(),
  venueIds: z.array(id).min(1),
});

export async function createPlanVersionAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = planTermsSchema.safeParse({
    planId: text(formData, "planId"),
    nameUz: text(formData, "name.uz"),
    nameRu: text(formData, "name.ru"),
    nameEn: text(formData, "name.en"),
    descriptionUz: text(formData, "description.uz"),
    descriptionRu: text(formData, "description.ru"),
    descriptionEn: text(formData, "description.en"),
    priceSom: text(formData, "priceSom"),
    durationDays: text(formData, "durationDays"),
    visitAllowance: text(formData, "visitAllowance"),
    dailyVisitLimit: text(formData, "dailyVisitLimit"),
    maxFutureBookings: text(formData, "maxFutureBookings"),
    bookingWindowDays: text(formData, "bookingWindowDays"),
    freeCancellationMinutes: text(formData, "freeCancellationMinutes"),
    isDemo: formData.get("isDemo") === "on",
    venueIds: formData.getAll("venueIds").map(String),
  });
  if (!parsed.success) {
    return invalid(String(parsed.error.issues[0]?.path[0] ?? "form"));
  }
  const d = parsed.data;
  const localizedText = (uz: string, ru: string, en: string) =>
    Object.fromEntries(Object.entries({ uz, ru, en }).filter(([key, value]) => key === "uz" || value !== ""));
  const terms: Json = {
    name: localizedText(d.nameUz, d.nameRu, d.nameEn),
    description: localizedText(d.descriptionUz, d.descriptionRu, d.descriptionEn),
    price_minor: d.priceSom * 100,
    duration_days: d.durationDays,
    visit_allowance: d.visitAllowance,
    daily_visit_limit: d.dailyVisitLimit,
    max_future_bookings: d.maxFutureBookings,
    booking_window_days: d.bookingWindowDays,
    free_cancellation_minutes: d.freeCancellationMinutes,
    is_demo: d.isDemo,
  };
  return run((supabase) =>
    supabase.rpc("admin_create_plan_version", { p_plan_id: d.planId, p_terms: terms, p_venue_ids: d.venueIds }),
  );
}

export async function planVersionAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z
    .object({ planVersionId: id, operation: z.enum(["publish", "retire", "delete"]) })
    .safeParse({ planVersionId: text(formData, "planVersionId"), operation: text(formData, "operation") });
  if (!parsed.success) {
    return invalid("form");
  }
  const { planVersionId, operation } = parsed.data;
  return run((supabase) =>
    operation === "publish"
      ? supabase.rpc("admin_publish_plan_version", { p_plan_version_id: planVersionId })
      : operation === "retire"
        ? supabase.rpc("admin_retire_plan_version", { p_plan_version_id: planVersionId })
        : supabase.rpc("admin_delete_plan_version_draft", { p_plan_version_id: planVersionId }),
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/** Records a refund that the provider or a documented manual process already confirmed. */
export async function recordRefundAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z.object({ orderId: id, reason, reference: z.string().trim().min(3).max(200) }).safeParse({
    orderId: text(formData, "orderId"),
    reason: text(formData, "reason"),
    reference: text(formData, "reference"),
  });
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "form");
    return field === "reference" ? fail("REFERENCE_REQUIRED", { reference: "invalid" }) : invalid(field);
  }
  return run((supabase) =>
    supabase.rpc("admin_record_refund", {
      p_order_id: parsed.data.orderId,
      p_reason: parsed.data.reason,
      p_reference: parsed.data.reference,
    }),
  );
}

export async function resolveReconciliationAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = z
    .object({ orderId: id, reason })
    .safeParse({ orderId: text(formData, "orderId"), reason: text(formData, "reason") });
  if (!parsed.success) {
    return invalid(String(parsed.error.issues[0]?.path[0] ?? "form"));
  }
  return run((supabase) =>
    supabase.rpc("admin_resolve_reconciliation", { p_order_id: parsed.data.orderId, p_note: parsed.data.reason }),
  );
}
