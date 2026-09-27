import "server-only";
import { isProductionDeployment } from "@/lib/env";
import { logEvent } from "@/lib/request";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

/**
 * Persistent fixed-window rate limit stored in Postgres (shared by every serverless instance).
 * Used before calls to Supabase Auth; database functions enforce their own limits internally.
 * Returns true when the request may proceed.
 */
export async function consumeRateLimit(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  if (!hasAdminClient()) {
    if (isProductionDeployment()) {
      // Never run production without persistent enforcement.
      logEvent("error", "rate_limit.unconfigured", { bucket: bucket.split(":")[0] });
      return false;
    }
    return true;
  }
  const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    logEvent("error", "rate_limit.failed", { bucket: bucket.split(":")[0], code: error.code });
    return false;
  }
  return data === true;
}
