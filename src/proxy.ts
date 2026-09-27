import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/lib/i18n/routing";
import { buildContentSecurityPolicy } from "@/lib/security/csp";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

const handleLocaleRouting = createIntlMiddleware(routing);

/**
 * Runs before every page request:
 *  1. assigns a request ID (forwarded to the database for audit correlation),
 *  2. creates a CSP nonce,
 *  3. refreshes the Supabase session (verified with getClaims) and forwards fresh cookies,
 *  4. applies locale routing.
 * Authorization is never decided here: every page, Server Action, and database function checks it.
 */
export async function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const nonce = btoa(crypto.randomUUID());
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const csp = buildContentSecurityPolicy({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    isDevelopment: process.env.NODE_ENV === "development",
    upgradeInsecure: appUrl.startsWith("https://"),
  });

  // Headers set on the request are forwarded to rendering by the locale router.
  request.headers.set("x-request-id", requestId);
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);

  const session = await refreshSupabaseSession(request);
  const response = handleLocaleRouting(request);

  for (const { name, value, options } of session.cookies) {
    response.cookies.set(name, value, options);
  }
  for (const [key, value] of Object.entries(session.headers)) {
    response.headers.set(key, value);
  }
  response.headers.set("content-security-policy", csp);
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes, the auth callback, Next.js assets, and static files are excluded.
      source: "/((?!api|auth|_next/static|_next/image|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
