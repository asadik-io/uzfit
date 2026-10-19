import "server-only";
import { createDbClient } from "./client";
import { getStore } from "./store";

/**
 * Privileged client that bypasses the owner-scoping policies. Used only in trusted server paths:
 * verified payment events, maintenance jobs, rate limiting and account deletion.
 */
export function createAdminClient() {
  return createDbClient(
    getStore(),
    { uid: null, email: null, aal: "aal1", role: "service_role", requestId: null },
    null,
  );
}

/** The demo always has its privileged client available. */
export function hasAdminClient(): boolean {
  return true;
}
