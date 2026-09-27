import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  Actor,
  addMinutes,
  addStaff,
  closeAll,
  createActivity,
  createOrg,
  createPlanVersion,
  createSession,
  createUser,
  createVenue,
  expectError,
  makeAdmin,
  setSetting,
  settle,
  sql,
  tashkent,
} from "./support";

afterAll(closeAll);

const now = tashkent("2024-06-03 10:00");

type Order = { order_id: string; amount_minor: string; currency: string; expires_at: Date; is_demo: boolean };
type EventResult = { outcome: string; outcome_code: string | null; order_status: string; membership_id: string | null };

async function world(price = 29_900_000) {
  const org = await createOrg();
  const venue = await createVenue(org);
  const activity = await createActivity(venue);
  const planVersionId = await createPlanVersion([venue], { priceMinor: price, durationDays: 30 });
  const memberId = await createUser();
  return { org, venue, activity, planVersionId, memberId };
}

async function createOrder(memberId: string, planVersionId: string, provider = "demo"): Promise<Order> {
  const member = await Actor.member(memberId, now);
  return member.rpcOne<Order>("create_order", { p_plan_version_id: planVersionId, p_provider: provider });
}

interface EventInput {
  orderId: string;
  status: "pending" | "succeeded" | "failed" | "refunded";
  amount?: number;
  currency?: string;
  transaction?: string;
  dedupKey?: string;
  provider?: string;
}

async function applyEvent(event: EventInput, at: Date = now): Promise<EventResult> {
  const service = await Actor.service(at);
  return service.rpcOne<EventResult>("apply_payment_event", {
    p_provider: event.provider ?? "demo",
    p_dedup_key: event.dedupKey ?? randomUUID(),
    p_event_type: `payment.${event.status}`,
    p_order_id: event.orderId,
    p_provider_transaction_id: event.transaction ?? `txn-${event.orderId}`,
    p_amount_minor: event.amount ?? 29_900_000,
    p_currency: event.currency ?? "UZS",
    p_status: event.status,
    p_metadata: { source: "test" },
  });
}

async function memberships(userId: string) {
  return sql<{ id: string; status: string; source: string; order_id: string | null; starts_at: Date; ends_at: Date }>(
    `select id, status, source, order_id, starts_at, ends_at from public.memberships where user_id = $1 order by created_at`,
    [userId],
  );
}

async function order(orderId: string) {
  const [row] = await sql<{ status: string; needs_reconciliation: boolean; amount_minor: string }>(
    `select status, needs_reconciliation, amount_minor from public.orders where id = $1`,
    [orderId],
  );
  return row!;
}

describe("create_order", () => {
  it("snapshots the plan version price and supersedes older open checkouts", async () => {
    const w = await world(49_900_000);
    const first = await createOrder(w.memberId, w.planVersionId);
    expect(first).toMatchObject({ amount_minor: "49900000", currency: "UZS", is_demo: true });
    expect(first.expires_at.toISOString()).toBe(addMinutes(now, 30).toISOString());

    const second = await createOrder(w.memberId, w.planVersionId);
    expect((await order(first.order_id)).status).toBe("cancelled");
    expect((await order(second.order_id)).status).toBe("pending");
  });

  it("refuses a purchase while a membership is active", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    await applyEvent({ orderId: o.order_id, status: "succeeded" });
    await expectError(createOrder(w.memberId, w.planVersionId), "MEMBERSHIP_ALREADY_ACTIVE");
  });

  it("refuses demo checkout when demo payments are disabled (production default)", async () => {
    const w = await world();
    await setSetting("demo_payments_enabled", false);
    try {
      await expectError(createOrder(w.memberId, w.planVersionId), "PAYMENT_UNAVAILABLE");
    } finally {
      await setSetting("demo_payments_enabled", true);
    }
  });

  it("refuses unpublished plan versions", async () => {
    const w = await world();
    await sql(`update public.plan_versions set status = 'retired', retired_at = now() where id = $1`, [w.planVersionId]);
    await expectError(createOrder(w.memberId, w.planVersionId), "PLAN_NOT_AVAILABLE");
  });
});

describe("apply_payment_event", () => {
  it("activates exactly one 30-day membership from a verified success", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    const result = await applyEvent({ orderId: o.order_id, status: "succeeded" });
    expect(result).toMatchObject({ outcome: "processed", outcome_code: "MEMBERSHIP_ACTIVATED", order_status: "paid" });

    const rows = await memberships(w.memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "active", source: "demo", order_id: o.order_id, id: result.membership_id });
    expect(rows[0]!.starts_at.toISOString()).toBe(now.toISOString());
    expect(rows[0]!.ends_at.toISOString()).toBe(addMinutes(now, 30 * 24 * 60).toISOString());

    const notices = await sql(`select message_key from public.notifications where user_id = $1`, [w.memberId]);
    expect(notices.map((n) => n.message_key)).toContain("membership_activated");
  });

  it("records each provider event once and never activates twice for duplicates", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    const dedupKey = randomUUID();
    const first = await applyEvent({ orderId: o.order_id, status: "succeeded", dedupKey });
    const again = await applyEvent({ orderId: o.order_id, status: "succeeded", dedupKey });
    // The same transaction reported under a new event id is recognised as no change.
    const sameTxn = await applyEvent({ orderId: o.order_id, status: "succeeded" });
    expect(first.outcome_code).toBe("MEMBERSHIP_ACTIVATED");
    expect(again).toMatchObject({ outcome: "duplicate", outcome_code: "DUPLICATE_EVENT" });
    expect(sameTxn).toMatchObject({ outcome: "ignored", outcome_code: "NO_CHANGE" });
    expect(await memberships(w.memberId)).toHaveLength(1);
    const events = await sql(`select outcome from public.payment_events where order_id = $1 order by received_at`, [
      o.order_id,
    ]);
    expect(events.map((e) => e.outcome)).toEqual(["processed", "ignored"]);
  });

  it("deduplicates concurrent deliveries of the same event", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    const dedupKey = randomUUID();
    const { ok, errors } = await settle(
      Array.from({ length: 8 }, () => () => applyEvent({ orderId: o.order_id, status: "succeeded", dedupKey })),
    );
    expect(errors).toEqual([]);
    expect(ok.filter((r) => r.outcome === "processed")).toHaveLength(1);
    expect(ok.filter((r) => r.outcome === "duplicate")).toHaveLength(7);
    expect(await memberships(w.memberId)).toHaveLength(1);
  });

  it("rejects wrong amounts and currencies without granting entitlement", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    const lowAmount = await applyEvent({ orderId: o.order_id, status: "succeeded", amount: 100 });
    expect(lowAmount).toMatchObject({ outcome: "rejected", outcome_code: "AMOUNT_MISMATCH", order_status: "pending" });
    const wrongCurrency = await applyEvent({ orderId: o.order_id, status: "succeeded", currency: "USD", transaction: `t2-${randomUUID()}` });
    expect(wrongCurrency).toMatchObject({ outcome: "rejected", outcome_code: "AMOUNT_MISMATCH" });
    expect(await memberships(w.memberId)).toEqual([]);
    // A verified success with the wrong amount needs a human decision.
    expect((await order(o.order_id)).needs_reconciliation).toBe(true);
  });

  it("rejects events for unknown orders, another provider, or a transaction of another order", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    expect((await applyEvent({ orderId: randomUUID(), status: "succeeded" })).outcome_code).toBe("ORDER_NOT_FOUND");
    expect((await applyEvent({ orderId: o.order_id, status: "succeeded", provider: "payme" })).outcome_code).toBe(
      "PROVIDER_MISMATCH",
    );
    const other = await world();
    const otherOrder = await createOrder(other.memberId, other.planVersionId);
    const shared = `shared-${randomUUID()}`;
    await applyEvent({ orderId: otherOrder.order_id, status: "succeeded", transaction: shared });
    expect((await applyEvent({ orderId: o.order_id, status: "succeeded", transaction: shared })).outcome_code).toBe(
      "TRANSACTION_ORDER_MISMATCH",
    );
    expect(await memberships(w.memberId)).toEqual([]);
  });

  it("never moves a terminal success back to pending or failed", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    await applyEvent({ orderId: o.order_id, status: "succeeded" });
    const latePending = await applyEvent({ orderId: o.order_id, status: "pending" });
    const lateFailure = await applyEvent({ orderId: o.order_id, status: "failed" });
    expect(latePending).toMatchObject({ outcome: "ignored", outcome_code: "STALE_EVENT", order_status: "paid" });
    expect(lateFailure).toMatchObject({ outcome: "ignored", outcome_code: "STALE_EVENT", order_status: "paid" });
    const [payment] = await sql<{ status: string }>(`select status from public.payments where order_id = $1`, [o.order_id]);
    expect(payment!.status).toBe("succeeded");
    expect(await memberships(w.memberId)).toHaveLength(1);
  });

  it("accepts a verified success that arrives after a failure or after the checkout expired", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    expect((await applyEvent({ orderId: o.order_id, status: "failed" })).order_status).toBe("failed");
    expect((await applyEvent({ orderId: o.order_id, status: "succeeded" })).outcome_code).toBe("MEMBERSHIP_ACTIVATED");

    const w2 = await world();
    const expired = await createOrder(w2.memberId, w2.planVersionId);
    const job = await Actor.service(addMinutes(now, 60));
    await job.rpc("expire_stale_orders", { p_limit: 1000 });
    expect((await order(expired.order_id)).status).toBe("cancelled");
    const late = await applyEvent({ orderId: expired.order_id, status: "succeeded" }, addMinutes(now, 61));
    expect(late).toMatchObject({ outcome_code: "MEMBERSHIP_ACTIVATED", order_status: "paid" });
  });

  it("keeps an extra payment for reconciliation instead of creating overlapping memberships", async () => {
    const w = await world();
    const firstOrder = await createOrder(w.memberId, w.planVersionId);
    const secondOrder = await createOrder(w.memberId, w.planVersionId); // supersedes the first checkout
    // Both checkouts were paid at the provider and both confirmations arrive at the same time.
    const { ok, errors } = await settle([
      () => applyEvent({ orderId: firstOrder.order_id, status: "succeeded" }),
      () => applyEvent({ orderId: secondOrder.order_id, status: "succeeded" }),
    ]);
    expect(errors).toEqual([]);
    expect(ok.map((r) => r.outcome_code).sort()).toEqual(["MEMBERSHIP_ACTIVATED", "PAID_NEEDS_RECONCILIATION"]);
    expect(await memberships(w.memberId)).toHaveLength(1);
    const orders = [await order(firstOrder.order_id), await order(secondOrder.order_id)];
    expect(orders.map((o) => o.status)).toEqual(["paid", "paid"]);
    expect(orders.filter((o) => o.needs_reconciliation)).toHaveLength(1);
    expect(await sql(`select 1 from public.payments where order_id = any ($1)`, [[firstOrder.order_id, secondOrder.order_id]])).toHaveLength(2);
  });

  it("flags a second successful transaction for an already paid order", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    await applyEvent({ orderId: o.order_id, status: "succeeded", transaction: `t1-${o.order_id}` });
    const duplicate = await applyEvent({ orderId: o.order_id, status: "succeeded", transaction: `t2-${o.order_id}` });
    expect(duplicate.outcome_code).toBe("DUPLICATE_PAYMENT");
    expect((await order(o.order_id)).needs_reconciliation).toBe(true);
    expect(await memberships(w.memberId)).toHaveLength(1);
  });

  it("rejects demo events when demo payments are disabled", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    await setSetting("demo_payments_enabled", false);
    try {
      const result = await applyEvent({ orderId: o.order_id, status: "succeeded" });
      expect(result).toMatchObject({ outcome: "rejected", outcome_code: "DEMO_DISABLED", order_status: "pending" });
      expect(await memberships(w.memberId)).toEqual([]);
    } finally {
      await setSetting("demo_payments_enabled", true);
    }
  });
});

describe("refunds", () => {
  it("revokes the membership on a provider-confirmed refund, releasing future reservations only", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    const { membership_id } = await applyEvent({ orderId: o.order_id, status: "succeeded" });
    const member = await Actor.member(w.memberId, now);
    const past = await createSession(w.activity, tashkent("2024-06-03 12:00"));
    const future = await createSession(w.activity, tashkent("2024-06-05 18:00"));
    const attended = await member.rpcOne<{ booking_id: string }>("create_booking", {
      p_session_id: past,
      p_idempotency_key: randomUUID(),
    });
    await sql(`update public.bookings set state = 'checked_in', checked_in_at = now() where id = $1`, [attended.booking_id]);
    const upcoming = await member.rpcOne<{ booking_id: string }>("create_booking", {
      p_session_id: future,
      p_idempotency_key: randomUUID(),
    });

    const refund = await applyEvent({ orderId: o.order_id, status: "refunded" }, addMinutes(now, 180));
    expect(refund).toMatchObject({ outcome_code: "ORDER_REFUNDED", order_status: "refunded" });

    const [m] = await sql<{ status: string }>(`select status from public.memberships where id = $1`, [membership_id]);
    expect(m!.status).toBe("revoked");
    const states = await sql<{ id: string; state: string }>(`select id, state from public.bookings where user_id = $1`, [
      w.memberId,
    ]);
    expect(Object.fromEntries(states.map((s) => [s.id, s.state]))).toEqual({
      [attended.booking_id]: "checked_in",
      [upcoming.booking_id]: "cancelled_on_time",
    });
    await expectError(
      member.rpc("create_booking", { p_session_id: future, p_idempotency_key: randomUUID() }),
      "MEMBERSHIP_REQUIRED",
    );
  });

  it("does not auto-apply a partial refund", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    await applyEvent({ orderId: o.order_id, status: "succeeded" });
    const partial = await applyEvent({ orderId: o.order_id, status: "refunded", amount: 1_000_000 });
    expect(partial).toMatchObject({ outcome: "rejected", outcome_code: "PARTIAL_REFUND_UNSUPPORTED", order_status: "paid" });
    expect((await order(o.order_id)).needs_reconciliation).toBe(true);
  });

  it("lets an admin record a verified manual refund with a reference", async () => {
    const w = await world();
    const o = await createOrder(w.memberId, w.planVersionId);
    await applyEvent({ orderId: o.order_id, status: "succeeded" });
    const adminId = await createUser("Admin");
    await makeAdmin(adminId);
    const admin = await Actor.as({ userId: adminId, aal: "aal2", now });

    await expectError(
      admin.rpc("admin_record_refund", { p_order_id: o.order_id, p_reason: "Customer request", p_reference: "" }),
      "REFERENCE_REQUIRED",
    );
    await admin.rpc("admin_record_refund", {
      p_order_id: o.order_id,
      p_reason: "Customer request",
      p_reference: "BANK-2024-0001",
    });
    expect((await order(o.order_id)).status).toBe("refunded");
    expect((await memberships(w.memberId))[0]!.status).toBe("revoked");
    await expectError(
      admin.rpc("admin_record_refund", { p_order_id: o.order_id, p_reason: "again", p_reference: "BANK-2" }),
      "ORDER_NOT_REFUNDABLE",
    );
    const audit = await sql(`select action from public.audit_logs where target_id = $1`, [o.order_id]);
    expect(audit.map((a) => a.action)).toContain("order.refund");

    // Staff and members cannot record refunds.
    const staffId = await createUser();
    await addStaff(w.org, staffId, "manager");
    await expectError(
      (await Actor.member(staffId, now)).rpc("admin_record_refund", {
        p_order_id: o.order_id,
        p_reason: "x reason",
        p_reference: "REF-1",
      }),
      "FORBIDDEN",
    );
  });
});
