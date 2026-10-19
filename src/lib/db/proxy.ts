import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionCookie } from "./session";

export interface SessionCheck {
  /** True when the request carries a validly signed, unexpired session cookie. */
  authenticated: boolean;
}

/** Verifies the demo session cookie for the proxy; pages re-check the user on every request. */
export async function readSession(request: NextRequest): Promise<SessionCheck> {
  const claims = await verifySessionCookie(request.cookies.get(SESSION_COOKIE)?.value);
  return { authenticated: claims !== null };
}
