import type { Locale } from "@/lib/i18n/routing";
import type { Database } from "@/lib/supabase/database.types";

export type PaymentProviderId = Database["public"]["Enums"]["payment_provider"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];

/** Immutable order snapshot created by the database (create_order). */
export interface CheckoutOrder {
  orderId: string;
  amountMinor: number;
  currency: string;
  locale: Locale;
}

/**
 * A provider notification or status query result after authentication, normalized for
 * apply_payment_event. Amounts are integer minor units in the order's currency; adapters convert
 * from the provider's representation at this boundary.
 */
export interface NormalizedPaymentEvent {
  /** Stable per provider event; a repeated delivery must produce the same key. */
  dedupKey: string;
  eventType: string;
  orderId: string;
  providerTransactionId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  /** Non-sensitive fields kept for support (never card data or secrets). */
  metadata: Record<string, string | number | boolean | null>;
}

export type CallbackVerification =
  { ok: true; events: NormalizedPaymentEvent[] } | { ok: false; httpStatus: 400 | 401 | 403; reason: string };

/**
 * Payment integration contract. A local provider (for example Payme or Click) is added by
 * implementing this interface from the provider's official documentation and merchant
 * credentials; memberships, orders, and entitlement rules do not change.
 */
export interface PaymentAdapter {
  readonly id: PaymentProviderId;
  /** Demo adapters never collect money and are refused in production. */
  readonly isDemo: boolean;
  /**
   * How refunds are executed. "manual": in the provider's merchant tools, then recorded by an
   * admin with the provider's reference. Unsupported actions stay unavailable in the UI.
   */
  readonly refunds: "manual" | "unsupported";
  /** Whether checkout can start in this environment (credentials present, not demo in production). */
  isAvailable(): boolean;
  /** Starts a checkout for a pending order and returns where to send the member. */
  createCheckout(order: CheckoutOrder): Promise<{ redirectUrl: string }>;
  /** Authenticates a provider callback and normalizes its events. Never trusts unauthenticated input. */
  verifyCallback(input: { rawBody: string; headers: Headers }): Promise<CallbackVerification>;
  /** Server-side status query used by reconciliation; null when the provider has no queryable state. */
  queryStatus(order: {
    orderId: string;
    amountMinor: number;
    currency: string;
  }): Promise<NormalizedPaymentEvent | null>;
}
