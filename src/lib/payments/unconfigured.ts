import "server-only";
import type { PaymentAdapter, PaymentProviderId } from "./types";

/**
 * Placeholder for a provider that has no verified integration yet. Checkout reports
 * PAYMENT_UNAVAILABLE and every callback is refused; nothing is simulated. Replace it with a
 * real adapter built from the provider's official documentation and merchant credentials.
 */
export function unconfiguredAdapter(id: Exclude<PaymentProviderId, "demo">): PaymentAdapter {
  return {
    id,
    isDemo: false,
    refunds: "unsupported",
    isAvailable: () => false,
    async createCheckout() {
      throw new Error(`Payment provider "${id}" is not integrated`);
    },
    async verifyCallback() {
      return { ok: false, httpStatus: 403, reason: "provider_not_integrated" };
    },
    async queryStatus() {
      return null;
    },
  };
}
