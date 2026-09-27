import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { logEvent } from "@/lib/request";
import { localeFromPath, safeRedirectTarget } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["email", "signup", "recovery", "email_change", "invite", "magiclink"];

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Completes email confirmation, password recovery, and email change links. Accepts either a
 * token hash (UzFit email templates; works in any browser) or a PKCE code. Redirects only to
 * internal paths on the configured app origin.
 */
export async function GET(request: NextRequest) {
  const origin = appUrl().origin;
  const params = request.nextUrl.searchParams;
  const target = safeRedirectTarget(params.get("redirect_to") ?? params.get("next"), origin, "/uz/explore");
  const locale = localeFromPath(target);
  const redirectTo = (path: string, query: Record<string, string> = {}) => {
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    const response = NextResponse.redirect(url, { status: 303 });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };

  const supabase = await createClient();
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const code = params.get("code");

  if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      logEvent("warn", "auth.callback_verify_failed", { type, code: error.code ?? String(error.status) });
      return redirectTo(type === "recovery" ? `/${locale}/forgot-password` : `/${locale}/login`, {
        error: "INVALID_LINK",
      });
    }
    if (type === "recovery") {
      return redirectTo(`/${locale}/reset-password`);
    }
    return redirectTo(target, { notice: "email_confirmed" });
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      logEvent("warn", "auth.callback_exchange_failed", { code: error.code ?? String(error.status) });
      // Opening the link in another browser loses the PKCE verifier; the address itself is
      // already confirmed by Supabase, so the member can simply sign in.
      return redirectTo(`/${locale}/login`, { notice: "confirm_sign_in" });
    }
    return redirectTo(target, { notice: "welcome" });
  }

  return redirectTo(`/${locale}/login`, { error: "INVALID_LINK" });
}
