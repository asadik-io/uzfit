/**
 * Payment processing (service role only). apply_payment_event records each provider event once,
 * validates the transaction, amount and currency against the order snapshot, moves payment state
 * forward only, and activates at most one membership per member.
 */
import {
  addDaysIso,
  audit,
  byId,
  insertRow,
  lockMember,
  notify,
  nowIso,
  revokeMembershipCore,
  rowsWhere,
  touch,
} from "../core";
import type { Json } from "../database.types";
import { fail } from "../errors";
import type { Row } from "../query";
import type { Args, RpcContext } from "./context";

export function apply_payment_event({ tables, actor }: RpcContext, args: Args) {
  const now = nowIso();
  const provider = String(args.p_provider ?? "");
  const status = String(args.p_status ?? "");
  const dedupKey = String(args.p_dedup_key ?? "");
  const eventType = String(args.p_event_type ?? "");
  if (
    !provider ||
    !status ||
    dedupKey.length < 1 ||
    dedupKey.length > 300 ||
    eventType.length < 1 ||
    eventType.length > 100
  ) {
    fail("VALIDATION_FAILED", "malformed payment event");
  }
  const currency = String(args.p_currency ?? "")
    .trim()
    .toUpperCase();
  const txn = String(args.p_provider_transaction_id ?? "").trim() || null;
  const amount = typeof args.p_amount_minor === "number" ? args.p_amount_minor : null;
  const orderStatus = () => (byId(tables, "orders", args.p_order_id)?.status as string | undefined) ?? null;

  if (rowsWhere(tables, "payment_events", (e) => e.provider === provider && e.dedup_key === dedupKey).length) {
    return [
      { outcome: "duplicate", outcome_code: "DUPLICATE_EVENT", order_status: orderStatus(), membership_id: null },
    ];
  }
  const event = insertRow(tables, "payment_events", {
    provider,
    dedup_key: dedupKey,
    event_type: eventType,
    order_id: null,
    payment_id: null,
    provider_transaction_id: txn ? txn.slice(0, 200) : null,
    outcome: "processed",
    outcome_code: null,
    safe_metadata: typeof args.p_metadata === "object" && args.p_metadata !== null ? args.p_metadata : {},
  });

  let outcome = "processed";
  let code: string | null = null;
  let membershipId: string | null = null;
  let order: Row | undefined;
  let payment: Row | undefined;

  const flag = (note: string) => {
    Object.assign(order!, { needs_reconciliation: true, reconciliation_note: note.slice(0, 1000) });
    touch("orders", order!);
  };

  process: {
    order = byId(tables, "orders", args.p_order_id);
    if (!order) {
      outcome = "rejected";
      code = "ORDER_NOT_FOUND";
      break process;
    }
    lockMember(tables, String(order.user_id));
    if (order.provider !== provider) {
      outcome = "rejected";
      code = "PROVIDER_MISMATCH";
      break process;
    }
    if (!txn || txn.length > 200) {
      outcome = "rejected";
      code = "MISSING_TRANSACTION";
      break process;
    }
    if (
      ["pending", "succeeded", "refunded"].includes(status) &&
      (amount !== Number(order.amount_minor) || currency !== String(order.currency))
    ) {
      outcome = "rejected";
      code = status === "refunded" ? "PARTIAL_REFUND_UNSUPPORTED" : "AMOUNT_MISMATCH";
      if (status !== "pending") {
        flag(`${code}: provider reported ${amount ?? "null"} ${currency} for transaction ${txn}`);
      }
      break process;
    }
    payment = rowsWhere(tables, "payments", (p) => p.provider === provider && p.provider_transaction_id === txn)[0];
    if (payment && payment.order_id !== order.id) {
      outcome = "rejected";
      code = "TRANSACTION_ORDER_MISMATCH";
      break process;
    }
    if (!payment) {
      payment = insertRow(tables, "payments", {
        order_id: order.id,
        provider,
        provider_transaction_id: txn,
        amount_minor: Number(order.amount_minor),
        currency: String(order.currency),
        status,
        succeeded_at: status === "succeeded" || status === "refunded" ? now : null,
        failed_at: status === "failed" ? now : null,
        refunded_at: status === "refunded" ? now : null,
      });
    } else if (payment.status === status) {
      outcome = "ignored";
      code = "NO_CHANGE";
      break process;
    } else if (
      payment.status === "refunded" ||
      (payment.status === "succeeded" && (status === "pending" || status === "failed")) ||
      (payment.status === "failed" && status === "pending")
    ) {
      outcome = "ignored";
      code = "STALE_EVENT";
      break process;
    } else {
      Object.assign(payment, {
        status,
        succeeded_at: status === "succeeded" ? now : payment.succeeded_at,
        failed_at: status === "failed" ? now : payment.failed_at,
        refunded_at: status === "refunded" ? now : payment.refunded_at,
      });
      touch("payments", payment);
    }

    if (status === "succeeded") {
      if (order.status === "paid") {
        code = "DUPLICATE_PAYMENT";
        flag(`Additional successful transaction ${txn} for an already paid order`);
      } else if (order.status === "refunded") {
        code = "PAYMENT_AFTER_REFUND";
        flag(`Successful transaction ${txn} after the order was refunded`);
      } else {
        Object.assign(order, { status: "paid", paid_at: now });
        touch("orders", order);
        const active = rowsWhere(
          tables,
          "memberships",
          (m) => m.user_id === order!.user_id && m.status === "active" && String(m.ends_at) > now,
        );
        if (active.length) {
          code = "PAID_NEEDS_RECONCILIATION";
          flag("Paid while another membership was active; refund or apply manually");
        } else {
          const pv = byId(tables, "plan_versions", order.plan_version_id)!;
          const membership = insertRow(tables, "memberships", {
            user_id: order.user_id,
            plan_version_id: pv.id,
            starts_at: now,
            ends_at: addDaysIso(now, Number(pv.duration_days)),
            status: "active",
            source: order.is_demo ? "demo" : "payment",
            order_id: order.id,
            is_demo: Boolean(order.is_demo),
            granted_by: null,
            grant_reason: null,
            revoked_at: null,
            revoked_by: null,
            revoke_reason: null,
          });
          membershipId = String(membership.id);
          code = "MEMBERSHIP_ACTIVATED";
          notify(tables, String(order.user_id), "membership_activated", {
            membership_id: membershipId,
            plan_name: pv.name as Json,
            is_demo: Boolean(order.is_demo),
          });
          audit(tables, actor, "system", "membership.activate", "membership", membershipId, null, null, null, {
            order_id: String(order.id),
            user_id: String(order.user_id),
            plan_version_id: String(pv.id),
            source: order.is_demo ? "demo" : "payment",
          });
        }
      }
    }
    if (status === "failed") {
      if (order.status === "pending") {
        Object.assign(order, { status: "failed", failed_at: now });
        touch("orders", order);
        code = "ORDER_FAILED";
      } else {
        code = "ATTEMPT_FAILED";
      }
    }
    if (status === "refunded") {
      if (order.status === "paid") {
        Object.assign(order, {
          status: "refunded",
          refunded_at: now,
          refund_reference: `provider:${txn}`.slice(0, 200),
        });
        touch("orders", order);
        const membership = rowsWhere(
          tables,
          "memberships",
          (m) => m.order_id === order!.id && m.status === "active",
        )[0];
        if (membership) revokeMembershipCore(tables, actor, membership.id, "refunded by payment provider", "system");
        code = "ORDER_REFUNDED";
      } else {
        code = "REFUND_NEEDS_RECONCILIATION";
        flag(`Refund reported for transaction ${txn} on an order that is ${order.status}`);
      }
    }
    if (status === "pending") code = "PAYMENT_PENDING";
  }

  Object.assign(event, {
    outcome,
    outcome_code: code,
    order_id: order ? order.id : null,
    payment_id: payment ? payment.id : null,
  });
  if (outcome === "processed") {
    audit(tables, actor, "system", "payment.event", "order", String(args.p_order_id), null, null, null, {
      provider,
      status,
      code,
      transaction: txn,
    });
  }
  return [{ outcome, outcome_code: code, order_status: orderStatus(), membership_id: membershipId }];
}

export function get_order_for_payment({ tables }: RpcContext, args: Args) {
  const order = byId(tables, "orders", args.p_order_id);
  if (!order) return [];
  const pv = byId(tables, "plan_versions", order.plan_version_id);
  return [
    {
      order_id: String(order.id),
      user_id: String(order.user_id),
      plan_version_id: String(order.plan_version_id),
      plan_name: (pv?.name ?? null) as Json,
      amount_minor: Number(order.amount_minor),
      currency: String(order.currency),
      provider: order.provider,
      is_demo: Boolean(order.is_demo),
      status: order.status,
      expires_at: String(order.expires_at),
      created_at: String(order.created_at),
    },
  ];
}

export function list_orders_for_reconciliation({ tables }: RpcContext, args: Args) {
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const limit = Math.min(Math.max(typeof args.p_limit === "number" ? args.p_limit : 50, 1), 500);
  return rowsWhere(tables, "orders", (o) => o.status === "pending" && String(o.created_at) < cutoff)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(0, limit)
    .map((o) => ({
      order_id: String(o.id),
      provider: o.provider,
      amount_minor: Number(o.amount_minor),
      currency: String(o.currency),
      created_at: String(o.created_at),
      expires_at: String(o.expires_at),
    }));
}
