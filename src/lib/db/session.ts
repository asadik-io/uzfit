/**
 * Signed, stateless session cookie for the demo. Uses Web Crypto only, so the same code runs
 * in the proxy and in server components. The cookie carries the user id and expiry; the
 * signature prevents tampering. Nothing here is a secret worth more than the demo itself.
 */
export const SESSION_COOKIE = "uzfit_demo_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface SessionClaims {
  sub: string;
  email: string | null;
  iat: number;
  exp: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function secret(): string {
  return process.env.DEMO_SESSION_SECRET || "uzfit-demo-session-secret-change-me";
}

let keyPromise: Promise<CryptoKey> | null = null;
function key(): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
  return keyPromise;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

export async function createSessionCookie(user: { id: string; email: string | null }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = { sub: user.id, email: user.email, iat: now, exp: now + SESSION_MAX_AGE_SECONDS };
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySessionCookie(value: string | undefined | null): Promise<SessionClaims | null> {
  if (!value) {
    return null;
  }
  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return null;
  }
  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) {
    return null;
  }
  const valid = await crypto.subtle.verify("HMAC", await key(), signatureBytes, encoder.encode(payload));
  if (!valid) {
    return null;
  }
  const payloadBytes = fromBase64Url(payload);
  if (!payloadBytes) {
    return null;
  }
  try {
    const claims = JSON.parse(decoder.decode(payloadBytes)) as SessionClaims;
    if (typeof claims.sub !== "string" || typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
