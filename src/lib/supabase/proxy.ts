import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";

export interface SessionRefresh {
  cookies: Array<{ name: string; value: string; options: CookieOptions }>;
  headers: Record<string, string>;
}

/**
 * Refreshes the Supabase session for the incoming request. Updated cookies are written to the
 * request (so Server Components rendering this request see the fresh session) and returned so the
 * caller can set them on the response, together with the no-store cache headers Supabase requires
 * on responses that carry auth cookies.
 */
export async function refreshSupabaseSession(request: NextRequest): Promise<SessionRefresh> {
  const result: SessionRefresh = { cookies: [], headers: {} };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return result;
  }
  const hasAuthCookie = request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"));
  if (!hasAuthCookie) {
    return result;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        result.cookies.push(...cookiesToSet);
        Object.assign(result.headers, cacheHeaders);
      },
    },
  });

  // Verifies the JWT and refreshes it when it is about to expire.
  await supabase.auth.getClaims();
  return result;
}
