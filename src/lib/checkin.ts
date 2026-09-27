/** Prefix that lets the partner scanner recognise UzFit codes; the token after it is opaque. */
export const QR_PREFIX = "UZFIT1:";

/** Tokens are 32 random bytes in unpadded base64url. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Extracts the token from scanned or pasted text: tolerates the prefix, surrounding whitespace,
 * and line breaks inserted by copy/paste. Returns null for anything that cannot be a token, so
 * obviously wrong input is rejected before reaching the server.
 */
export function normalizeScannedToken(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "");
  const token = compact.toUpperCase().startsWith(QR_PREFIX) ? compact.slice(QR_PREFIX.length) : compact;
  return TOKEN_RE.test(token) ? token : null;
}
