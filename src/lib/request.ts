import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/** Request ID assigned by the proxy (or generated for requests that bypass it). */
export async function requestId(): Promise<string> {
  const value = (await headers()).get("x-request-id");
  return value && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : crypto.randomUUID();
}

/**
 * Client IP as reported by the hosting platform. On Vercel, x-forwarded-for is set by the edge
 * network; elsewhere it is only as trustworthy as the reverse proxy in front of the app.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

/** Short one-way hash so rate-limit buckets never store raw IPs or emails. */
export function bucketHash(value: string): string {
  return createHash("sha256").update(`uzfit:${value.toLowerCase()}`).digest("base64url").slice(0, 24);
}

/** Structured, sanitized server log line (no tokens, passwords, or personal data). */
export function logEvent(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
