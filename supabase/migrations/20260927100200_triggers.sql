-- UzFit triggers: account provisioning, timestamps, immutability rules, state transitions,
-- and the session occupancy counter. Triggers are defense in depth: API roles cannot write
-- these tables directly, and every mutation goes through a checked database function.

-- ---------------------------------------------------------------------------
-- Provision a profile and account status for each new auth user
-- ---------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80);
  v_locale text := new.raw_user_meta_data ->> 'locale';
begin
  -- User metadata is user-controlled: only accept a known locale.
  if v_locale is null or v_locale not in ('uz', 'ru', 'en') then
    v_locale := 'uz';
  end if;
  insert into public.profiles (id, display_name, locale)
  values (new.id, v_name, v_locale::public.locale_code)
  on conflict (id) do nothing;
  insert into public.account_statuses (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger account_statuses_updated_at before update on public.account_statuses
  for each row execute function private.set_updated_at();
create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger venues_updated_at before update on public.venues
  for each row execute function private.set_updated_at();
create trigger venue_revisions_updated_at before update on public.venue_revisions
  for each row execute function private.set_updated_at();
create trigger activities_updated_at before update on public.activities
  for each row execute function private.set_updated_at();
create trigger sessions_updated_at before update on public.sessions
  for each row execute function private.set_updated_at();
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();
create trigger payments_updated_at before update on public.payments
  for each row execute function private.set_updated_at();
create trigger bookings_updated_at before update on public.bookings
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Venues: slug and owning organization are fixed after creation
-- ---------------------------------------------------------------------------
create function private.venues_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug or new.organization_id is distinct from old.organization_id then
    perform private.fail('VENUE_IDENTITY_IMMUTABLE');
  end if;
  return new;
end;
$$;
create trigger venues_guard before update on public.venues
  for each row execute function private.venues_guard();

-- ---------------------------------------------------------------------------
-- Sessions: times and ownership are immutable; cancellation is one-way
-- ---------------------------------------------------------------------------
create function private.sessions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then
    perform private.fail('SESSION_TIME_IMMUTABLE');
  end if;
  if new.venue_id is distinct from old.venue_id or new.activity_id is distinct from old.activity_id then
    perform private.fail('SESSION_IDENTITY_IMMUTABLE');
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    perform private.fail('SESSION_CANCELLED');
  end if;
  if new.occupied_count > new.capacity then
    if new.occupied_count > old.occupied_count then
      perform private.fail('SESSION_FULL');
    end if;
    perform private.fail('CAPACITY_BELOW_OCCUPIED');
  end if;
  return new;
end;
$$;
create trigger sessions_guard before update on public.sessions
  for each row execute function private.sessions_guard();

-- ---------------------------------------------------------------------------
-- Plan versions: only drafts are editable; published versions may only be retired
-- ---------------------------------------------------------------------------
create function private.plan_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      perform private.fail('PLAN_VERSION_IMMUTABLE');
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    if new.status not in ('draft', 'published') then
      perform private.fail('PLAN_VERSION_IMMUTABLE', 'a draft can only be published');
    end if;
    return new;
  end if;

  -- Published or retired: terms are frozen.
  if (to_jsonb(new) - array['status', 'retired_at']) is distinct from (to_jsonb(old) - array['status', 'retired_at']) then
    perform private.fail('PLAN_VERSION_IMMUTABLE');
  end if;
  if not (old.status = 'published' and new.status = 'retired') and new.status is distinct from old.status then
    perform private.fail('PLAN_VERSION_IMMUTABLE', 'invalid status transition');
  end if;
  return new;
end;
$$;
create trigger plan_versions_guard before update or delete on public.plan_versions
  for each row execute function private.plan_versions_guard();

create function private.plan_version_venues_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pv uuid := coalesce(new.plan_version_id, old.plan_version_id);
begin
  if tg_op = 'UPDATE' and new.plan_version_id is distinct from old.plan_version_id then
    perform private.fail('PLAN_VERSION_IMMUTABLE');
  end if;
  if exists (select 1 from public.plan_versions pv where pv.id = v_pv and pv.status <> 'draft') then
    perform private.fail('PLAN_VERSION_IMMUTABLE', 'venue eligibility of a published version cannot change');
  end if;
  return coalesce(new, old);
end;
$$;
create trigger plan_version_venues_guard before insert or update or delete on public.plan_version_venues
  for each row execute function private.plan_version_venues_guard();

-- ---------------------------------------------------------------------------
-- Orders: immutable price snapshot and explicit status transitions
-- ---------------------------------------------------------------------------
create function private.orders_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.plan_version_id is distinct from old.plan_version_id
     or new.amount_minor is distinct from old.amount_minor
     or new.currency is distinct from old.currency
     or new.provider is distinct from old.provider
     or new.is_demo is distinct from old.is_demo
     or new.created_at is distinct from old.created_at then
    perform private.fail('ORDER_SNAPSHOT_IMMUTABLE');
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'pending' and new.status in ('paid', 'failed', 'cancelled'))
    -- A verified success may arrive after an attempt failed or the checkout expired.
    or (old.status in ('failed', 'cancelled') and new.status = 'paid')
    or (old.status = 'paid' and new.status = 'refunded')
  ) then
    perform private.fail('ORDER_INVALID_TRANSITION', old.status || ' -> ' || new.status);
  end if;
  return new;
end;
$$;
create trigger orders_guard before update on public.orders
  for each row execute function private.orders_guard();

create function private.payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.order_id is distinct from old.order_id
     or new.provider is distinct from old.provider
     or new.provider_transaction_id is distinct from old.provider_transaction_id
     or new.amount_minor is distinct from old.amount_minor
     or new.currency is distinct from old.currency then
    perform private.fail('PAYMENT_IMMUTABLE');
  end if;
  -- Terminal success never moves back to pending or failed.
  if new.status is distinct from old.status and not (
       (old.status = 'pending' and new.status in ('succeeded', 'failed'))
    or (old.status = 'failed' and new.status = 'succeeded')
    or (old.status = 'succeeded' and new.status = 'refunded')
  ) then
    perform private.fail('PAYMENT_INVALID_TRANSITION', old.status || ' -> ' || new.status);
  end if;
  return new;
end;
$$;
create trigger payments_guard before update on public.payments
  for each row execute function private.payments_guard();

-- ---------------------------------------------------------------------------
-- Memberships: contract terms are immutable; revocation is one-way
-- ---------------------------------------------------------------------------
create function private.memberships_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.fail('MEMBERSHIP_IMMUTABLE');
  end if;
  if new.user_id is distinct from old.user_id
     or new.plan_version_id is distinct from old.plan_version_id
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.source is distinct from old.source
     or new.order_id is distinct from old.order_id
     or new.is_demo is distinct from old.is_demo then
    perform private.fail('MEMBERSHIP_IMMUTABLE');
  end if;
  if old.status = 'revoked' and new.status <> 'revoked' then
    perform private.fail('MEMBERSHIP_IMMUTABLE', 'revocation is permanent');
  end if;
  return new;
end;
$$;
create trigger memberships_guard before update or delete on public.memberships
  for each row execute function private.memberships_guard();

-- ---------------------------------------------------------------------------
-- Bookings: explicit, irreversible state machine; audited admin corrections only
-- ---------------------------------------------------------------------------
create function private.bookings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.fail('BOOKING_IMMUTABLE', 'reservations are never deleted');
  end if;

  if new.user_id is distinct from old.user_id
     or new.session_id is distinct from old.session_id
     or new.membership_id is distinct from old.membership_id
     or new.venue_id is distinct from old.venue_id
     or new.local_date is distinct from old.local_date
     or new.session_starts_at is distinct from old.session_starts_at
     or new.session_ends_at is distinct from old.session_ends_at
     or new.cancellation_deadline is distinct from old.cancellation_deadline
     or new.checkin_opens_at is distinct from old.checkin_opens_at
     or new.checkin_closes_at is distinct from old.checkin_closes_at
     or new.policy_snapshot is distinct from old.policy_snapshot
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at then
    perform private.fail('BOOKING_IMMUTABLE');
  end if;

  if new.state is distinct from old.state then
    if old.state = 'confirmed'
       and new.state in ('checked_in', 'cancelled_on_time', 'cancelled_late', 'venue_cancelled', 'no_show') then
      return new;
    end if;
    -- Corrections of final states are allowed only inside the audited admin operation, which
    -- sets this transaction-local flag.
    if current_setting('uzfit.booking_correction', true) = 'on' then
      return new;
    end if;
    perform private.fail('BOOKING_INVALID_TRANSITION', old.state || ' -> ' || new.state);
  end if;
  return new;
end;
$$;
create trigger bookings_guard before update or delete on public.bookings
  for each row execute function private.bookings_guard();

-- Maintains sessions.occupied_count. Confirmed and checked-in reservations occupy a place.
-- The check constraint occupied_count <= capacity makes overbooking fail at the row level.
create function private.bookings_occupancy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old boolean := false;
  v_new boolean := new.state in ('confirmed', 'checked_in');
begin
  if tg_op = 'UPDATE' then
    v_old := old.state in ('confirmed', 'checked_in');
  end if;
  if v_new and not v_old then
    update public.sessions set occupied_count = occupied_count + 1 where id = new.session_id;
  elsif v_old and not v_new then
    update public.sessions set occupied_count = occupied_count - 1 where id = new.session_id;
  end if;
  return null;
end;
$$;
create trigger bookings_occupancy after insert or update of state on public.bookings
  for each row execute function private.bookings_occupancy();

-- ---------------------------------------------------------------------------
-- Append-only records
-- ---------------------------------------------------------------------------
create function private.append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.fail('APPEND_ONLY', tg_table_name);
  return null;
end;
$$;
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function private.append_only();
create trigger checkins_append_only before update or delete on public.checkins
  for each row execute function private.append_only();
create trigger payment_events_no_delete before delete on public.payment_events
  for each row execute function private.append_only();
create trigger payments_no_delete before delete on public.payments
  for each row execute function private.append_only();
create trigger orders_no_delete before delete on public.orders
  for each row execute function private.append_only();
