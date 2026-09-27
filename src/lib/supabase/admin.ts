import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Privileged client that bypasses RLS. Use only in trusted backend paths with explicit
 * validation: verified payment callbacks, protected jobs, persistent rate limiting, and admin
 * operations on Supabase Auth users. Never import from client components.
 */
export function createAdminClient() {
  const env = serverEnv();
  if (!env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY is not configured");
  }
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function hasAdminClient(): boolean {
  try {
    return Boolean(serverEnv().SUPABASE_SECRET_KEY);
  } catch {
    return false;
  }
}
