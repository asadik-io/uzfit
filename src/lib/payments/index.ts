import "server-only";
import { serverEnv } from "@/lib/env";
import { demoAdapter } from "./demo";
import type { PaymentAdapter, PaymentProviderId } from "./types";
import { unconfiguredAdapter } from "./unconfigured";

export type { PaymentAdapter, PaymentProviderId } from "./types";

const PROVIDERS: readonly PaymentProviderId[] = ["demo", "payme", "click"];

export function isPaymentProviderId(value: string): value is PaymentProviderId {
  return (PROVIDERS as readonly string[]).includes(value);
}

/** Adapter for callbacks and reconciliation of orders created with a given provider. */
export function adapterFor(provider: PaymentProviderId): PaymentAdapter {
  return provider === "demo" ? demoAdapter : unconfiguredAdapter(provider);
}

/**
 * The adapter used for new checkouts (PAYMENT_PROVIDER), or null when online payment is not
 * offered in this environment. Checkout then explains that payment is unavailable.
 */
export function checkoutAdapter(): PaymentAdapter | null {
  const provider = serverEnv().PAYMENT_PROVIDER;
  if (provider === "none") {
    return null;
  }
  const adapter = adapterFor(provider);
  return adapter.isAvailable() ? adapter : null;
}
