import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once per process. The demo runs without any external service,
 * so every variable has a safe default; secrets are read only here and in the modules that need
 * them (payment adapters, job authentication), never in client bundles.
 */
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  PAYMENT_PROVIDER: z.enum(["demo", "payme", "click", "none"]).default("demo"),
  PAYMENT_MERCHANT_ID: z.string().optional(),
  PAYMENT_API_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  /** Shared password of the demo accounts (shown on the sign-in page). */
  DEMO_PASSWORD: z.string().min(8).optional(),
  /** Signs the session cookie; any long random string. */
  DEMO_SESSION_SECRET: z.string().min(16).optional(),
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

/** True when the configuration parses, so pages can render a setup notice otherwise. */
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
 * The demo payment adapter simulates a provider and never collects money. This deployment is a
 * public demo, so it is available in every environment while PAYMENT_PROVIDER is `demo`.
 */
export function demoPaymentsAllowed(): boolean {
  return serverEnv().PAYMENT_PROVIDER === "demo";
}

/** The whole deployment is a demo with fictional data; the banner is always shown. */
export function isDemoMode(): boolean {
  return true;
}

export function appUrl(): URL {
  return new URL(serverEnv().NEXT_PUBLIC_APP_URL);
}
