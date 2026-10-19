import "server-only";
import { cookies, headers } from "next/headers";
import { findUser } from "./auth";
import { createDbClient, type DbActor } from "./client";
import { SESSION_COOKIE, verifySessionCookie } from "./session";
import { getStore } from "./store";

/**
 * Session-bound client for Server Components, Server Actions and Route Handlers. Queries run as
 * the signed-in user, so the owner-scoping policies apply. Create one per request.
 */
export async function createClient() {
  const store = getStore();
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const claims = await verifySessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
  const user = findUser(store, claims?.sub ?? null);
  const actor: DbActor = {
    uid: user ? String(user.id) : null,
    email: user ? ((user.email as string | null) ?? null) : null,
    aal: "aal1",
    role: user ? "authenticated" : "anon",
    requestId: requestHeaders.get("x-request-id"),
  };
  return createDbClient(store, actor, {
    get: (name) => cookieStore.get(name)?.value,
    set: (name, value, options) => {
      try {
        cookieStore.set(name, value, options);
      } catch {
        // Server Components cannot set cookies; only Server Actions and Route Handlers sign in.
      }
    },
    delete: (name) => {
      try {
        cookieStore.delete(name);
      } catch {
        // Same as above.
      }
    },
  });
}

export type ServerClient = Awaited<ReturnType<typeof createClient>>;
