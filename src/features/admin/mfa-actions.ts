"use server";

import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { type ActionResult, fail } from "@/lib/errors";
import { consumeRateLimit } from "@/lib/rate-limit";
import { logEvent, requestId } from "@/lib/request";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts TOTP enrollment for the signed-in admin. Unverified leftovers from an abandoned
 * enrollment are removed first so a fresh secret is issued.
 */
export async function startTotpEnrollmentAction(): Promise<
  ActionResult<{ factorId: string; qrCode: string; secret: string }>
> {
  const viewer = await getViewer();
  if (!viewer) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) {
    return fail("UNEXPECTED_ERROR");
  }
  if (factors.totp.some((factor) => factor.status === "verified")) {
    return fail("VALIDATION_FAILED");
  }
  for (const factor of factors.all.filter((f) => f.factor_type === "totp" && f.status === "unverified")) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `UzFit admin ${new Date().toISOString().slice(0, 10)}`,
    issuer: "UzFit",
  });
  if (error || !data) {
    logEvent("error", "mfa.enroll_failed", { requestId: await requestId(), status: error?.status });
    return fail("UNEXPECTED_ERROR");
  }
  return { ok: true, data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret } };
}

const verifySchema = z.object({ factorId: z.guid(), code: z.string().regex(/^\d{6}$/) });

/** Verifies a TOTP code, upgrading the session to aal2. Attempts are rate limited. */
export async function verifyTotpAction(factorId: string, code: string): Promise<ActionResult> {
  const parsed = verifySchema.safeParse({ factorId, code: code.replace(/\s/g, "") });
  if (!parsed.success) {
    return fail("MFA_CODE_INVALID");
  }
  const viewer = await getViewer();
  if (!viewer) {
    return fail("AUTH_REQUIRED");
  }
  if (!(await consumeRateLimit(`mfa:${viewer.id}`, 10, 900))) {
    return fail("RATE_LIMITED");
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) {
    return fail("MFA_CODE_INVALID");
  }
  return { ok: true };
}
