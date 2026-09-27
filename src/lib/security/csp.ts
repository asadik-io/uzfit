/**
 * Builds the per-request Content-Security-Policy. Scripts must carry the request nonce (Next.js
 * applies it to its own scripts automatically). Inline style attributes are allowed because
 * accessible UI primitives position popovers with them; they cannot execute code.
 */
export function buildContentSecurityPolicy(options: {
  nonce: string;
  supabaseUrl?: string;
  isDevelopment: boolean;
  upgradeInsecure: boolean;
}): string {
  const supabaseOrigin = options.supabaseUrl ? new URL(options.supabaseUrl).origin : "";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${options.nonce}'`, "'strict-dynamic'", ...(options.isDevelopment ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...(supabaseOrigin ? [supabaseOrigin] : [])],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (options.upgradeInsecure) {
    policy.push("upgrade-insecure-requests");
  }
  return policy.join("; ");
}
