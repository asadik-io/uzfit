import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { serverEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Session-bound Supabase client for Server Components, Server Actions, and Route Handlers.
 * Queries run as the signed-in user, so RLS and function-level authorization apply.
 * Create a new client per request; never share one across requests.
 */
export async function createClient() {
  const env = serverEnv();
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const requestId = requestHeaders.get("x-request-id");

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; the proxy refreshes sessions on each request.
        }
      },
    },
    global: {
      // Forwarded to PostgREST so audit entries can be correlated with application logs.
      headers: requestId ? { "x-request-id": requestId } : {},
    },
  });
}

export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
