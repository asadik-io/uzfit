"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionResult, type DomainErrorCode, fail } from "@/lib/errors";
import { appUrl } from "@/lib/env";
import { isLocale, type Locale } from "@/lib/i18n/routing";
import { consumeRateLimit } from "@/lib/rate-limit";
import { bucketHash, clientIp, logEvent } from "@/lib/request";
import { safeInternalPath, safeLocalePath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, passwordSchema } from "@/lib/validation/auth";

function localeOf(value: FormDataEntryValue | null): Locale {
  return isLocale(value) ? value : "uz";
}

/** Maps Supabase Auth error codes to domain codes without exposing provider messages. */
function authError(code: string | undefined, status: number | undefined): DomainErrorCode {
  switch (code) {
    case "invalid_credentials":
      return "INVALID_CREDENTIALS";
    case "email_not_confirmed":
      return "EMAIL_NOT_CONFIRMED";
    case "user_already_exists":
    case "email_exists":
      return "EMAIL_IN_USE";
    case "weak_password":
      return "WEAK_PASSWORD";
    case "same_password":
      return "SAME_PASSWORD";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "RATE_LIMITED";
    case "otp_expired":
    case "bad_jwt":
    case "session_not_found":
      return "INVALID_LINK";
    default:
      return status === 429 ? "RATE_LIMITED" : "UNEXPECTED_ERROR";
  }
}

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

export async function signInAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const locale = localeOf(formData.get("locale"));
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return fail("VALIDATION_FAILED");
  }
  const { email, password } = parsed.data;
  const ip = await clientIp();
  const allowed =
    (await consumeRateLimit(`login:ip:${bucketHash(ip)}`, 30, 300)) &&
    (await consumeRateLimit(`login:email:${bucketHash(email)}`, 10, 900));
  if (!allowed) {
    return fail("RATE_LIMITED");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logEvent("warn", "auth.sign_in_failed", { code: error.code ?? String(error.status) });
    return fail(authError(error.code, error.status));
  }
  redirect(safeLocalePath(formData.get("next"), `/${locale}/explore`));
}

const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80),
});

export async function signUpAction(
  _prev: ActionResult<{ email: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ email: string }>> {
  const locale = localeOf(formData.get("locale"));
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return fail("VALIDATION_FAILED");
  }
  const { email, password, displayName } = parsed.data;
  const ip = await clientIp();
  if (!(await consumeRateLimit(`signup:ip:${bucketHash(ip)}`, 10, 3600))) {
    return fail("RATE_LIMITED");
  }

  // Return to a plain internal path after confirmation (no query string, see email templates).
  const next = safeInternalPath(formData.get("next"), `/${locale}/plans`);
  const redirectTo = new URL(/^\/(uz|ru|en)\/[A-Za-z0-9/_-]*$/.test(next) ? next : `/${locale}/plans`, appUrl());

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo.toString(), data: { display_name: displayName, locale } },
  });
  if (error) {
    logEvent("warn", "auth.sign_up_failed", { code: error.code ?? String(error.status) });
    return fail(authError(error.code, error.status));
  }
  // With email confirmation enabled, Supabase does not reveal whether the address already existed.
  if (data.session) {
    redirect(`/${locale}/plans`);
  }
  return { ok: true, data: { email } };
}

export async function requestPasswordResetAction(
  _prev: ActionResult<{ email: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ email: string }>> {
  const locale = localeOf(formData.get("locale"));
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return fail("VALIDATION_FAILED");
  }
  const email = parsed.data;
  const ip = await clientIp();
  const allowed =
    (await consumeRateLimit(`reset:ip:${bucketHash(ip)}`, 10, 3600)) &&
    (await consumeRateLimit(`reset:email:${bucketHash(email)}`, 3, 3600));
  if (!allowed) {
    return fail("RATE_LIMITED");
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL(`/${locale}/reset-password`, appUrl()).toString(),
  });
  if (error && authError(error.code, error.status) === "RATE_LIMITED") {
    return fail("RATE_LIMITED");
  }
  if (error) {
    logEvent("warn", "auth.reset_request_failed", { code: error.code ?? String(error.status) });
  }
  // Always report success so the form cannot be used to discover registered addresses.
  return { ok: true, data: { email } };
}

const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

export async function updatePasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const locale = localeOf(formData.get("locale"));
  const parsed = resetSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    return fail("VALIDATION_FAILED");
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return fail("INVALID_LINK");
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return fail(authError(error.code, error.status));
  }
  redirect(`/${locale}/profile?notice=password_updated`);
}

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = localeOf(formData.get("locale"));
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(`/${locale}?notice=signed_out`);
}
