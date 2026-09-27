-- UzFit payment processing. These functions are executable only with the server's privileged
-- key, after the payment adapter has authenticated the provider callback or status query.
--
-- apply_payment_event guarantees, in one transaction:
--   * each provider event is recorded once (provider + dedup key);
--   * amount and currency must match the order's immutable snapshot;
--   * payment status only moves forward (a terminal success never returns to pending/failed);
--   * at most one membership is activated per member at a time, under the member lock;
--   * a verified extra payment is recorded and flagged for reconciliation, never discarded.

create function public.apply_payment_event(
  p_provider public.payment_provider,
  p_dedup_key text,
  p_event_type text,
  p_order_id uuid,
  p_provider_transaction_id text,
  p_amount_minor bigint,
  p_currency text,
  p_status public.payment_status,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  outcome public.payment_event_outcome,
  outcome_code text,
  order_status public.order_status,
  membership_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_now timestamptz := private.now();
  v_event_id uuid;
  v_order public.orders%rowtype;
  v_order_found boolean := false;
  v_payment public.payments%rowtype;
  v_payment_found boolean;
  v_pv public.plan_versions%rowtype;
  v_membership_id uuid;
  v_outcome public.payment_event_outcome := 'processed';
  v_code text;
  v_transitioned boolean := false;
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_txn text := nullif(btrim(coalesce(p_provider_transaction_id, '')), '');
  v_revoke uuid;
begin
  if p_provider is null or p_status is null
     or coalesce(char_length(p_dedup_key), 0) not between 1 and 300
     or coalesce(char_length(p_event_type), 0) not between 1 and 100 then
    perform private.fail('VALIDATION_FAILED', 'malformed payment event');
  end if;

  -- Deduplicate. Concurrent deliveries of the same event serialize on the unique index.
  insert into public.payment_events (provider, dedup_key, event_type, provider_transaction_id, outcome, safe_metadata)
  values (p_provider, p_dedup_key, p_event_type, left(v_txn, 200), 'processed',
          case when jsonb_typeof(p_metadata) = 'object' then p_metadata else '{}'::jsonb end)
  on conflict (provider, dedup_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return query
      select 'duplicate'::public.payment_event_outcome, 'DUPLICATE_EVENT'::text,
             (select o.status from public.orders o where o.id = p_order_id), null::uuid;
    return;
  end if;

  <<process>>
  begin
    if p_provider = 'demo' and not private.setting_bool('demo_payments_enabled', false) then
      v_outcome := 'rejected'; v_code := 'DEMO_DISABLED';
      exit process;
    end if;

    select * into v_order from public.orders o where o.id = p_order_id;
    if not found then
      v_outcome := 'rejected'; v_code := 'ORDER_NOT_FOUND';
      exit process;
    end if;
    v_order_found := true;

    -- Lock order: member coordination row first, then the order.
    perform private.lock_member(v_order.user_id);
    select * into v_order from public.orders o where o.id = p_order_id for no key update;

    if v_order.provider <> p_provider then
      v_outcome := 'rejected'; v_code := 'PROVIDER_MISMATCH';
      exit process;
    end if;
    if v_txn is null or char_length(v_txn) > 200 then
      v_outcome := 'rejected'; v_code := 'MISSING_TRANSACTION';
      exit process;
    end if;

    if p_status in ('pending', 'succeeded', 'refunded')
       and (p_amount_minor is distinct from v_order.amount_minor or v_currency is distinct from v_order.currency::text) then
      v_outcome := 'rejected';
      v_code := case when p_status = 'refunded' then 'PARTIAL_REFUND_UNSUPPORTED' else 'AMOUNT_MISMATCH' end;
      if p_status in ('succeeded', 'refunded') then
        update public.orders o
           set needs_reconciliation = true,
               reconciliation_note = left(v_code || ': provider reported ' || coalesce(p_amount_minor::text, 'null')
                                          || ' ' || v_currency || ' for transaction ' || v_txn, 1000)
         where o.id = v_order.id;
      end if;
      exit process;
    end if;

    select * into v_payment from public.payments p
     where p.provider = p_provider and p.provider_transaction_id = v_txn
     for no key update;
    v_payment_found := found;

    if v_payment_found and v_payment.order_id <> v_order.id then
      v_outcome := 'rejected'; v_code := 'TRANSACTION_ORDER_MISMATCH';
      exit process;
    end if;

    if not v_payment_found then
      insert into public.payments (order_id, provider, provider_transaction_id, amount_minor, currency, status,
                                   succeeded_at, failed_at, refunded_at)
      values (v_order.id, p_provider, v_txn, v_order.amount_minor, v_order.currency, p_status,
              case when p_status in ('succeeded', 'refunded') then v_now end,
              case when p_status = 'failed' then v_now end,
              case when p_status = 'refunded' then v_now end)
      returning * into v_payment;
      v_transitioned := true;
    elsif v_payment.status = p_status then
      v_outcome := 'ignored'; v_code := 'NO_CHANGE';
      exit process;
    elsif v_payment.status = 'refunded'
       or (v_payment.status = 'succeeded' and p_status in ('pending', 'failed'))
       or (v_payment.status = 'failed' and p_status = 'pending') then
      -- Out-of-order delivery: never move a later state back.
      v_outcome := 'ignored'; v_code := 'STALE_EVENT';
      exit process;
    else
      update public.payments p
         set status = p_status,
             succeeded_at = case when p_status = 'succeeded' then v_now else p.succeeded_at end,
             failed_at = case when p_status = 'failed' then v_now else p.failed_at end,
             refunded_at = case when p_status = 'refunded' then v_now else p.refunded_at end
       where p.id = v_payment.id
      returning * into v_payment;
      v_transitioned := true;
    end if;

    if not v_transitioned then
      exit process;
    end if;

    -- A refund seen before any success for this transaction is recorded but not applied to the
    -- order automatically (see the refunded branch below: it is flagged for reconciliation).
    if p_status = 'succeeded' then
      -- Money was collected for this order.
      if v_order.status = 'paid' then
        v_code := 'DUPLICATE_PAYMENT';
        update public.orders o
           set needs_reconciliation = true,
               reconciliation_note = left('Additional successful transaction ' || v_txn || ' for an already paid order', 1000)
         where o.id = v_order.id;
      elsif v_order.status = 'refunded' then
        v_code := 'PAYMENT_AFTER_REFUND';
        update public.orders o
           set needs_reconciliation = true,
               reconciliation_note = left('Successful transaction ' || v_txn || ' after the order was refunded', 1000)
         where o.id = v_order.id;
      else
        update public.orders o set status = 'paid', paid_at = v_now where o.id = v_order.id;
        if exists (
          select 1 from public.memberships m
           where m.user_id = v_order.user_id and m.status = 'active' and m.ends_at > v_now
        ) then
          -- Keep the payment; never create overlapping entitlement.
          v_code := 'PAID_NEEDS_RECONCILIATION';
          update public.orders o
             set needs_reconciliation = true,
                 reconciliation_note = 'Paid while another membership was active; refund or apply manually'
           where o.id = v_order.id;
        else
          select * into v_pv from public.plan_versions pv where pv.id = v_order.plan_version_id;
          insert into public.memberships (user_id, plan_version_id, starts_at, ends_at, status, source, order_id, is_demo)
          values (v_order.user_id, v_pv.id, v_now, v_now + make_interval(days => v_pv.duration_days), 'active',
                  case when v_order.is_demo then 'demo'::public.membership_source else 'payment'::public.membership_source end,
                  v_order.id, v_order.is_demo)
          returning id into v_membership_id;
          v_code := 'MEMBERSHIP_ACTIVATED';
          perform private.notify(v_order.user_id, 'membership_activated',
                                 jsonb_build_object('membership_id', v_membership_id, 'plan_name', v_pv.name,
                                                    'is_demo', v_order.is_demo));
          perform private.audit('system', 'membership.activate', 'membership', v_membership_id::text, null, null,
                                jsonb_build_object('order_id', v_order.id, 'user_id', v_order.user_id,
                                                   'plan_version_id', v_pv.id, 'source',
                                                   case when v_order.is_demo then 'demo' else 'payment' end));
        end if;
      end if;
    end if;

    if p_status = 'failed' then
      if v_order.status = 'pending' then
        update public.orders o set status = 'failed', failed_at = v_now where o.id = v_order.id;
        v_code := 'ORDER_FAILED';
      else
        v_code := 'ATTEMPT_FAILED';
      end if;
    end if;

    if p_status = 'refunded' then
      -- Provider-confirmed full refund: the order is refunded and its membership revoked.
      select o.* into v_order from public.orders o where o.id = v_order.id;
      if v_order.status = 'paid' then
        update public.orders o
           set status = 'refunded', refunded_at = v_now, refund_reference = left('provider:' || v_txn, 200)
         where o.id = v_order.id;
        select m.id into v_revoke from public.memberships m where m.order_id = v_order.id and m.status = 'active';
        if v_revoke is not null then
          perform private.revoke_membership_core(v_revoke, 'refunded by payment provider', 'system');
        end if;
        v_code := 'ORDER_REFUNDED';
      else
        v_code := 'REFUND_NEEDS_RECONCILIATION';
        update public.orders o
           set needs_reconciliation = true,
               reconciliation_note = left('Refund reported for transaction ' || v_txn || ' on an order that is ' || v_order.status, 1000)
         where o.id = v_order.id;
      end if;
    end if;

    if p_status = 'pending' then
      v_code := 'PAYMENT_PENDING';
    end if;
  end process;

  update public.payment_events e
     set outcome = v_outcome,
         outcome_code = v_code,
         order_id = case when v_order_found then v_order.id end,
         payment_id = v_payment.id
   where e.id = v_event_id;

  if v_outcome = 'processed' then
    perform private.audit('system', 'payment.event', 'order', p_order_id::text, null, null,
                          jsonb_build_object('provider', p_provider, 'status', p_status, 'code', v_code,
                                             'transaction', v_txn));
  end if;

  return query
    select v_outcome, v_code, (select o.status from public.orders o where o.id = p_order_id), v_membership_id;
end;
$$;

-- Order snapshot for provider checkout creation and status reconciliation.
create function public.get_order_for_payment(p_order_id uuid)
returns table (
  order_id uuid,
  user_id uuid,
  plan_version_id uuid,
  plan_name jsonb,
  amount_minor bigint,
  currency text,
  provider public.payment_provider,
  is_demo boolean,
  status public.order_status,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.user_id, o.plan_version_id, pv.name, o.amount_minor, o.currency::text, o.provider, o.is_demo,
         o.status, o.expires_at, o.created_at
    from public.orders o
    join public.plan_versions pv on pv.id = o.plan_version_id
   where o.id = p_order_id;
$$;

-- Pending orders whose provider status should be queried by the reconciliation job.
create function public.list_orders_for_reconciliation(p_limit integer default 50)
returns table (order_id uuid, provider public.payment_provider, amount_minor bigint, currency text,
               created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.provider, o.amount_minor, o.currency::text, o.created_at, o.expires_at
    from public.orders o
   where o.status = 'pending' and o.created_at < private.now() - interval '2 minutes'
   order by o.created_at
   limit least(greatest(coalesce(p_limit, 50), 1), 500);
$$;

-- Pending checkouts that were never completed become cancelled. A later verified success is
-- still accepted by apply_payment_event (cancelled -> paid).
create function public.expire_stale_orders(p_limit integer default 200)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with stale as (
    select o.id from public.orders o
     where o.status = 'pending' and o.expires_at < private.now() - interval '15 minutes'
     order by o.expires_at
     limit least(greatest(coalesce(p_limit, 200), 1), 1000)
     for no key update skip locked
  )
  update public.orders o set status = 'cancelled', cancelled_at = private.now()
    from stale where o.id = stale.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Manual refund recorded by an admin after the provider or a documented manual process
-- confirmed it. The reference identifies that confirmation.
create function public.admin_record_refund(p_order_id uuid, p_reason text, p_reference text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
  v_user uuid;
  v_order public.orders%rowtype;
  v_membership uuid;
begin
  perform private.require_admin();
  if p_reference is null or char_length(btrim(p_reference)) not between 3 and 200 then
    perform private.fail('REFERENCE_REQUIRED');
  end if;
  select o.user_id into v_user from public.orders o where o.id = p_order_id;
  if v_user is null then
    perform private.fail('ORDER_NOT_FOUND');
  end if;
  perform private.lock_member(v_user);
  select * into v_order from public.orders o where o.id = p_order_id for no key update;
  if v_order.status <> 'paid' then
    perform private.fail('ORDER_NOT_REFUNDABLE');
  end if;
  update public.payments p set status = 'refunded', refunded_at = private.now()
   where p.order_id = p_order_id and p.status = 'succeeded';
  update public.orders o
     set status = 'refunded', refunded_at = private.now(), refund_reference = btrim(p_reference),
         needs_reconciliation = false,
         reconciliation_note = left(coalesce(o.reconciliation_note || ' | ', '') || 'Refunded: ' || v_reason, 1000)
   where o.id = p_order_id;
  select m.id into v_membership from public.memberships m where m.order_id = p_order_id and m.status = 'active';
  if v_membership is not null then
    perform private.revoke_membership_core(v_membership, 'refunded: ' || v_reason, 'admin');
  end if;
  perform private.audit('admin', 'order.refund', 'order', p_order_id::text, v_reason,
                        jsonb_build_object('status', 'paid'), jsonb_build_object('status', 'refunded'),
                        jsonb_build_object('reference', btrim(p_reference)));
end;
$$;

create function public.admin_resolve_reconciliation(p_order_id uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text := private.require_reason(p_note);
begin
  perform private.require_admin();
  update public.orders o
     set needs_reconciliation = false,
         reconciliation_note = left(coalesce(o.reconciliation_note || ' | ', '') || 'Resolved: ' || v_note, 1000)
   where o.id = p_order_id and o.needs_reconciliation;
  if not found then
    perform private.fail('NOT_FOUND');
  end if;
  perform private.audit('admin', 'order.reconcile', 'order', p_order_id::text, v_note);
end;
$$;

revoke execute on function
  public.apply_payment_event(public.payment_provider, text, text, uuid, text, bigint, text, public.payment_status, jsonb),
  public.get_order_for_payment(uuid),
  public.list_orders_for_reconciliation(integer),
  public.expire_stale_orders(integer)
  from public, anon, authenticated;
grant execute on function
  public.apply_payment_event(public.payment_provider, text, text, uuid, text, bigint, text, public.payment_status, jsonb),
  public.get_order_for_payment(uuid),
  public.list_orders_for_reconciliation(integer),
  public.expire_stale_orders(integer)
  to service_role;

revoke execute on function
  public.admin_record_refund(uuid, text, text),
  public.admin_resolve_reconciliation(uuid, text)
  from public, anon;
grant execute on function
  public.admin_record_refund(uuid, text, text),
  public.admin_resolve_reconciliation(uuid, text)
  to authenticated, service_role;
