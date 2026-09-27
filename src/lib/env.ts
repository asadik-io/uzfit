import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once per process. Secrets are read only here and in the modules
 * that need them (Supabase admin client, payment adapters, job authentication), never in client
 * bundles or NEXT_PUBLIC_* variables.
 */
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  PAYMENT_PROVIDER: z.enum(["demo", "payme", "click", "none"]).default("demo"),
  PAYMENT_MERCHANT_ID: z.string().optional(),
  PAYMENT_API_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  APP_ENV: z.enum(["development", "preview", "production"]).optional(),
  VERCEL_ENV: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

function blankToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

export class ConfigurationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid or missing environment variables: ${issues.join("; ")}`);
    this.name = "ConfigurationError";
  }
}

export function serverEnv(): ServerEnv {
  if (cached) {
    return cached;
  }
  const raw = Object.fromEntries(Object.keys(schema.shape).map((key) => [key, blankToUndefined(process.env[key])]));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigurationError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  cached = parsed.data;
  return cached;
}

/** True when the core public configuration exists, so pages can render a setup notice otherwise. */
export function isConfigured(): boolean {
  try {
    serverEnv();
    return true;
  } catch {
    return false;
  }
}

/** Production is Vercel's production environment, or APP_ENV=production on other hosts. */
export function isProductionDeployment(): boolean {
  const env = serverEnv();
  return env.VERCEL_ENV === "production" || env.APP_ENV === "production";
}

/**
 * The demo payment adapter is available only outside production. The database enforces the same
 * rule independently (private.settings.demo_payments_enabled is never set in production).
 */
export function demoPaymentsAllowed(): boolean {
  return serverEnv().PAYMENT_PROVIDER === "demo" && !isProductionDeployment();
}

/** Demo mode drives the persistent "demo data" banner. */
export function isDemoMode(): boolean {
  try {
    return demoPaymentsAllowed();
  } catch {
    return false;
  }
}

export function appUrl(): URL {
  return new URL(serverEnv().NEXT_PUBLIC_APP_URL);
}
