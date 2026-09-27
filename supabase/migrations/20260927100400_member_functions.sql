-- UzFit member-facing functions: catalog search, entitlement summaries, and the transactional
-- booking, cancellation, check-in token, and checkout operations.
--
-- The acting user is always derived from the verified JWT (auth.uid()), never from arguments.

-- ---------------------------------------------------------------------------
-- Catalog search (security invoker: RLS applies, plus explicit publication filters)
-- ---------------------------------------------------------------------------
create function public.search_venues(
  p_query text default null,
  p_city text default null,
  p_district text default null,
  p_category text default null,
  p_date date default null,
  p_plan text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_locale public.locale_code default 'uz',
  p_limit integer default 12,
  p_offset integer default 0
)
returns table (
  id uuid,
  slug text,
  name jsonb,
  address jsonb,
  district_slug text,
  district_name jsonb,
  city_slug text,
  cover_path text,
  cover_alt jsonb,
  category_slugs text[],
  plan_codes text[],
  latitude double precision,
  longitude double precision,
  distance_km double precision,
  is_demo boolean,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      nullif(
        replace(replace(replace(lower(left(btrim(coalesce(p_query, '')), 80)), '\', '\\'), '%', '\%'), '_', '\_'),
        ''
      ) as q,
      private.now() as now_at
  ),
  base as (
    select
      v.id, v.slug, v.name, v.address, v.latitude, v.longitude, v.is_demo,
      d.slug as district_slug, d.name as district_name, c.slug as city_slug,
      case
        when p_lat is not null and p_lng is not null and v.latitude is not null then
          6371.0 * 2 * asin(sqrt(
            power(sin(radians(v.latitude - p_lat) / 2), 2)
            + cos(radians(p_lat)) * cos(radians(v.latitude)) * power(sin(radians(v.longitude - p_lng) / 2), 2)
          ))
      end as distance_km
    from public.venues v
    join public.districts d on d.id = v.district_id
    join public.cities c on c.id = d.city_id
    cross join params pr
    where v.publication_status = 'published'
      and v.operational_status = 'active'
      and private.is_venue_public(v.id)
      and (p_city is null or c.slug = p_city)
      and (p_district is null or d.slug = p_district)
      and (
        pr.q is null
        or v.search_text like '%' || pr.q || '%' escape '\'
        or lower(coalesce(d.name ->> 'uz', '') || ' ' || coalesce(d.name ->> 'ru', '') || ' ' || coalesce(d.name ->> 'en', ''))
             like '%' || pr.q || '%' escape '\'
      )
      and (
        p_category is null
        or exists (
          select 1 from public.venue_categories vc
          join public.categories cat on cat.id = vc.category_id
          where vc.venue_id = v.id and cat.slug = p_category
        )
      )
      and (
        p_plan is null
        or exists (
          select 1 from public.plan_version_venues pvv
          join public.plan_versions pv on pv.id = pvv.plan_version_id
          join public.plans pl on pl.id = pv.plan_id
          where pvv.venue_id = v.id and pv.status = 'published' and pl.is_active and pl.code = p_plan
        )
      )
      and (
        p_date is null
        or exists (
          select 1 from public.sessions s
          where s.venue_id = v.id
            and s.status = 'scheduled'
            and s.starts_at >= (p_date::timestamp at time zone v.timezone)
            and s.starts_at < ((p_date + 1)::timestamp at time zone v.timezone)
            and s.starts_at > pr.now_at
        )
      )
  )
  select
    b.id, b.slug, b.name, b.address, b.district_slug, b.district_name, b.city_slug,
    cover.storage_path, cover.alt,
    coalesce((
      select array_agg(cat.slug order by cat.sort_order)
      from public.venue_categories vc join public.categories cat on cat.id = vc.category_id
      where vc.venue_id = b.id
    ), '{}'::text[]),
    coalesce((
      select array_agg(pl.code order by pl.sort_order)
      from public.plan_version_venues pvv
      join public.plan_versions pv on pv.id = pvv.plan_version_id
      join public.plans pl on pl.id = pv.plan_id
      where pvv.venue_id = b.id and pv.status = 'published' and pl.is_active
    ), '{}'::text[]),
    b.latitude, b.longitude, b.distance_km, b.is_demo,
    count(*) over ()
  from base b
  left join lateral (
    select vi.storage_path, vi.alt from public.venue_images vi
    where vi.venue_id = b.id order by vi.sort_order, vi.created_at limit 1
  ) cover on true
  order by
    b.distance_km asc nulls last,
    coalesce(b.name ->> p_locale::text, b.name ->> 'uz'),
    b.id
  limit least(greatest(coalesce(p_limit, 12), 1), 48)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- Capabilities of the current user (used to render navigation; never trusted for authorization)
-- ---------------------------------------------------------------------------
create function public.get_my_access()
returns table (
  user_id uuid,
  account_status public.account_status,
  has_admin_role boolean,
  admin_mfa_required boolean,
  admin_authorized boolean,
  organizations jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid(),
    s.status,
    private.has_admin_role(auth.uid()),
    private.admin_mfa_required(),
    private.is_platform_admin(),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'status', o.status, 'role', m.role)
                       order by o.name)
      from public.organization_members m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = auth.uid()
    ), '[]'::jsonb)
  from public.account_statuses s
  where s.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Current membership with authoritative usage computed from bookings
-- ---------------------------------------------------------------------------
create function public.get_my_membership()
returns table (
  membership_id uuid,
  plan_version_id uuid,
  plan_code text,
  plan_name jsonb,
  plan_version integer,
  starts_at timestamptz,
  ends_at timestamptz,
  source public.membership_source,
  is_demo boolean,
  visit_allowance integer,
  consumed integer,
  reserved integer,
  available integer,
  daily_visit_limit integer,
  max_future_bookings integer,
  booking_window_days integer,
  free_cancellation_minutes integer,
  upcoming_count integer,
  eligible_venue_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id, pv.id, pl.code, pv.name, pv.version, m.starts_at, m.ends_at, m.source, m.is_demo,
    pv.visit_allowance, u.consumed, u.reserved,
    greatest(pv.visit_allowance - u.consumed - u.reserved, 0),
    pv.daily_visit_limit, pv.max_future_bookings, pv.booking_window_days, pv.free_cancellation_minutes,
    (select count(*)::integer from public.bookings b
      where b.user_id = m.user_id and b.state = 'confirmed' and b.session_ends_at > private.now()),
    (select count(*)::integer from public.plan_version_venues pvv
      where pvv.plan_version_id = pv.id and private.is_venue_public(pvv.venue_id))
  from public.memberships m
  join public.plan_versions pv on pv.id = m.plan_version_id
  join public.plans pl on pl.id = pv.plan_id
  cross join lateral private.membership_usage(m.id) u
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.starts_at <= private.now()
    and private.now() < m.ends_at
  order by m.starts_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- The member's reservations with denormalized venue details (history stays readable even if
-- a venue is later unpublished).
-- ---------------------------------------------------------------------------
create function public.get_my_bookings(p_scope text default 'upcoming', p_limit integer default 20, p_offset integer default 0)
returns table (
  booking_id uuid,
  state public.booking_state,
  local_date date,
  session_id uuid,
  session_starts_at timestamptz,
  session_ends_at timestamptz,
  cancellation_deadline timestamptz,
  checkin_opens_at timestamptz,
  checkin_closes_at timestamptz,
  venue_id uuid,
  venue_slug text,
  venue_name jsonb,
  venue_address jsonb,
  venue_timezone text,
  activity_title jsonb,
  activity_kind public.activity_kind,
  session_status public.session_status,
  session_cancellation_reason text,
  cancelled_at timestamptz,
  cancellation_source public.cancellation_source,
  cancellation_reason text,
  checked_in_at timestamptz,
  created_at timestamptz,
  membership_id uuid,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id, b.state, b.local_date, b.session_id, b.session_starts_at, b.session_ends_at,
    b.cancellation_deadline, b.checkin_opens_at, b.checkin_closes_at,
    v.id, v.slug, v.name, v.address, v.timezone,
    a.title, a.kind, s.status, s.cancellation_reason,
    b.cancelled_at, b.cancellation_source, b.cancellation_reason, b.checked_in_at, b.created_at,
    b.membership_id,
    count(*) over ()
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.activities a on a.id = s.activity_id
  join public.venues v on v.id = b.venue_id
  where b.user_id = auth.uid()
    and (
      (p_scope = 'upcoming' and b.state = 'confirmed' and b.session_ends_at > private.now())
      or (p_scope = 'past' and not (b.state = 'confirmed' and b.session_ends_at > private.now()))
    )
  order by
    case when p_scope = 'upcoming' then b.session_starts_at end asc,
    case when p_scope <> 'upcoming' then b.session_starts_at end desc,
    b.id
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.get_my_booking(p_booking_id uuid)
returns table (
  booking_id uuid,
  state public.booking_state,
  local_date date,
  session_id uuid,
  session_starts_at timestamptz,
  session_ends_at timestamptz,
  cancellation_deadline timestamptz,
  checkin_opens_at timestamptz,
  checkin_closes_at timestamptz,
  venue_id uuid,
  venue_slug text,
  venue_name jsonb,
  venue_address jsonb,
  venue_timezone text,
  activity_title jsonb,
  activity_kind public.activity_kind,
  session_status public.session_status,
  session_cancellation_reason text,
  cancelled_at timestamptz,
  cancellation_source public.cancellation_source,
  cancellation_reason text,
  checked_in_at timestamptz,
  created_at timestamptz,
  membership_id uuid,
  plan_name jsonb,
  free_cancellation_minutes integer,
  server_now timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id, b.state, b.local_date, b.session_id, b.session_starts_at, b.session_ends_at,
    b.cancellation_deadline, b.checkin_opens_at, b.checkin_closes_at,
    v.id, v.slug, v.name, v.address, v.timezone,
    a.title, a.kind, s.status, s.cancellation_reason,
    b.cancelled_at, b.cancellation_source, b.cancellation_reason, b.checked_in_at, b.created_at,
    b.membership_id, pv.name,
    (b.policy_snapshot ->> 'free_cancellation_minutes')::integer,
    private.now()
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.activities a on a.id = s.activity_id
  join public.venues v on v.id = b.venue_id
  join public.memberships m on m.id = b.membership_id
  join public.plan_versions pv on pv.id = m.plan_version_id
  where b.id = p_booking_id and b.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- create_booking: atomic reservation with every entitlement and capacity rule re-checked
-- under the member lock and the session lock.
-- ---------------------------------------------------------------------------
create function public.create_booking(p_session_id uuid, p_idempotency_key uuid)
returns table (booking_id uuid, booking_state public.booking_state, replayed boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := private.now();
  v_status public.account_status;
  v_existing public.bookings%rowtype;
  v_session public.sessions%rowtype;
  v_venue public.venues%rowtype;
  v_membership public.memberships%rowtype;
  v_pv public.plan_versions%rowtype;
  v_booking public.bookings%rowtype;
  v_local_date date;
  v_count integer;
  v_consumed integer;
  v_reserved integer;
begin
  if v_uid is null then
    perform private.fail('AUTH_REQUIRED');
  end if;
  if p_session_id is null or p_idempotency_key is null then
    perform private.fail('VALIDATION_FAILED');
  end if;

  -- (1) Member coordination row.
  v_status := private.lock_member(v_uid);

  -- (2) Idempotent replay: the same key returns the original result; another payload is rejected.
  select * into v_existing from public.bookings b
   where b.user_id = v_uid and b.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.session_id <> p_session_id then
      perform private.fail('IDEMPOTENCY_KEY_REUSED');
    end if;
    return query select v_existing.id, v_existing.state, true;
    return;
  end if;

  if v_status <> 'active' then
    perform private.fail('ACCOUNT_SUSPENDED');
  end if;

  -- (3) Session row.
  select * into v_session from public.sessions s where s.id = p_session_id for no key update;
  if not found then
    perform private.fail('SESSION_NOT_FOUND');
  end if;
  select * into v_venue from public.venues v where v.id = v_session.venue_id;
  if not private.is_venue_public(v_venue.id) then
    perform private.fail('SESSION_NOT_BOOKABLE');
  end if;
  if v_session.status <> 'scheduled' then
    perform private.fail('SESSION_CANCELLED');
  end if;
  if v_session.starts_at <= v_now then
    perform private.fail('BOOKING_CLOSED');
  end if;

  -- (4) Entitlement: an active membership whose validity contains the whole session
  -- (half-open interval: starts_at <= session start and session end <= ends_at).
  select * into v_membership from public.memberships m
   where m.user_id = v_uid
     and m.status = 'active'
     and m.starts_at <= v_session.starts_at
     and v_session.ends_at <= m.ends_at
   order by m.starts_at desc
   limit 1;
  if not found then
    if exists (
      select 1 from public.memberships m
       where m.user_id = v_uid and m.status = 'active' and m.starts_at <= v_now and v_now < m.ends_at
    ) then
      perform private.fail('MEMBERSHIP_EXPIRES_BEFORE_SESSION');
    end if;
    perform private.fail('MEMBERSHIP_REQUIRED');
  end if;
  select * into v_pv from public.plan_versions pv where pv.id = v_membership.plan_version_id;

  if not exists (
    select 1 from public.plan_version_venues x where x.plan_version_id = v_pv.id and x.venue_id = v_venue.id
  ) then
    perform private.fail('PLAN_NOT_ELIGIBLE');
  end if;

  if v_session.starts_at > v_now + make_interval(days => v_pv.booking_window_days) then
    perform private.fail('BOOKING_WINDOW_EXCEEDED');
  end if;

  if exists (
    select 1 from public.bookings b
     where b.user_id = v_uid and b.session_id = v_session.id and b.state in ('confirmed', 'checked_in')
  ) then
    perform private.fail('ALREADY_BOOKED');
  end if;

  -- Half-open activity intervals: a session may start exactly when another ends.
  if exists (
    select 1 from public.bookings b
     where b.user_id = v_uid
       and b.state in ('confirmed', 'checked_in')
       and tstzrange(b.session_starts_at, b.session_ends_at, '[)')
           && tstzrange(v_session.starts_at, v_session.ends_at, '[)')
  ) then
    perform private.fail('TIME_CONFLICT');
  end if;

  -- Daily limit per local calendar day of the venue. Confirmed, checked-in, late-cancelled
  -- and no-show reservations occupy the day's slot.
  v_local_date := (v_session.starts_at at time zone v_venue.timezone)::date;
  select count(*) into v_count from public.bookings b
   where b.membership_id = v_membership.id
     and b.local_date = v_local_date
     and b.state in ('confirmed', 'checked_in', 'cancelled_late', 'no_show');
  if v_count >= v_pv.daily_visit_limit then
    perform private.fail('DAILY_LIMIT_REACHED');
  end if;

  select count(*) into v_count from public.bookings b
   where b.user_id = v_uid and b.state = 'confirmed' and b.session_ends_at > v_now;
  if v_count >= v_pv.max_future_bookings then
    perform private.fail('FUTURE_BOOKING_LIMIT_REACHED');
  end if;

  -- available = allowance - consumed - reserved (computed from bookings, never from clients).
  select u.consumed, u.reserved into v_consumed, v_reserved from private.membership_usage(v_membership.id) u;
  if v_pv.visit_allowance - v_consumed - v_reserved <= 0 then
    perform private.fail('VISIT_LIMIT_REACHED');
  end if;

  if v_session.occupied_count >= v_session.capacity then
    perform private.fail('SESSION_FULL');
  end if;

  insert into public.bookings (
    user_id, session_id, membership_id, venue_id, state, local_date,
    session_starts_at, session_ends_at, cancellation_deadline, checkin_opens_at, checkin_closes_at,
    policy_snapshot, idempotency_key
  )
  values (
    v_uid, v_session.id, v_membership.id, v_venue.id, 'confirmed', v_local_date,
    v_session.starts_at, v_session.ends_at,
    v_session.starts_at - make_interval(mins => v_pv.free_cancellation_minutes),
    v_session.starts_at - make_interval(mins => v_pv.checkin_opens_minutes),
    least(v_session.starts_at + make_interval(mins => v_pv.checkin_closes_minutes), v_session.ends_at),
    jsonb_build_object(
      'plan_version_id', v_pv.id,
      'free_cancellation_minutes', v_pv.free_cancellation_minutes,
      'checkin_opens_minutes', v_pv.checkin_opens_minutes,
      'checkin_closes_minutes', v_pv.checkin_closes_minutes,
      'daily_visit_limit', v_pv.daily_visit_limit,
      'max_future_bookings', v_pv.max_future_bookings,
      'timezone', v_venue.timezone
    ),
    p_idempotency_key
  )
  returning * into v_booking;

  perform private.notify(v_uid, 'booking_confirmed', private.booking_notice_params(v_booking.id));
  perform private.audit(
    'member', 'booking.create', 'booking', v_booking.id::text, null, null,
    jsonb_build_object('session_id', v_session.id, 'state', v_booking.state, 'membership_id', v_membership.id)
  );

  return query select v_booking.id, v_booking.state, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_booking: timely cancellation releases the visit; a late one consumes it. The member
-- must acknowledge the late consequence (p_accept_late) or the request is refused.
-- ---------------------------------------------------------------------------
create function public.cancel_booking(p_booking_id uuid, p_accept_late boolean default false)
returns table (booking_id uuid, booking_state public.booking_state, already_cancelled boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := private.now();
  v_owner uuid;
  v_session_id uuid;
  v_booking public.bookings%rowtype;
  v_new public.booking_state;
begin
  if v_uid is null then
    perform private.fail('AUTH_REQUIRED');
  end if;

  select b.user_id, b.session_id into v_owner, v_session_id from public.bookings b where b.id = p_booking_id;
  if not found or v_owner <> v_uid then
    perform private.fail('BOOKING_NOT_FOUND');
  end if;

  perform private.lock_member(v_uid);
  perform 1 from public.sessions s where s.id = v_session_id for no key update;
  select * into v_booking from public.bookings b where b.id = p_booking_id for no key update;

  if v_booking.state in ('cancelled_on_time', 'cancelled_late') then
    return query select v_booking.id, v_booking.state, true;
    return;
  end if;
  if v_booking.state = 'checked_in' then
    perform private.fail('ALREADY_CHECKED_IN');
  end if;
  if v_booking.state <> 'confirmed' then
    perform private.fail('BOOKING_NOT_CANCELLABLE');
  end if;
  if v_now >= v_booking.session_starts_at then
    perform private.fail('CANCELLATION_CLOSED');
  end if;

  if v_now <= v_booking.cancellation_deadline then
    v_new := 'cancelled_on_time';
  else
    if not coalesce(p_accept_late, false) then
      perform private.fail('LATE_CANCELLATION_UNCONFIRMED');
    end if;
    v_new := 'cancelled_late';
  end if;

  update public.bookings b
     set state = v_new, cancelled_at = v_now, cancelled_by = v_uid, cancellation_source = 'member'
   where b.id = v_booking.id;
  update public.checkin_tokens t
     set revoked_at = v_now
   where t.booking_id = v_booking.id and t.used_at is null and t.revoked_at is null;

  perform private.notify(
    v_uid,
    case when v_new = 'cancelled_on_time' then 'booking_cancelled' else 'booking_cancelled_late' end,
    private.booking_notice_params(v_booking.id)
  );
  perform private.audit(
    'member', 'booking.cancel', 'booking', v_booking.id::text, null,
    jsonb_build_object('state', v_booking.state), jsonb_build_object('state', v_new)
  );

  return query select v_booking.id, v_new, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- issue_checkin_token: a 60-second opaque token for the booking owner during the check-in
-- window. Only its SHA-256 hash is stored; reissuing revokes earlier unused tokens.
-- ---------------------------------------------------------------------------
create function public.issue_checkin_token(p_booking_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := private.now();
  v_owner uuid;
  v_status public.account_status;
  v_booking public.bookings%rowtype;
  v_membership public.memberships%rowtype;
  v_token text;
  v_expires timestamptz;
begin
  if v_uid is null then
    perform private.fail('AUTH_REQUIRED');
  end if;
  if not private.rate_limit_hit('checkin_issue:' || v_uid::text, 100, 3600) then
    perform private.fail('RATE_LIMITED');
  end if;

  select b.user_id into v_owner from public.bookings b where b.id = p_booking_id;
  if not found or v_owner <> v_uid then
    perform private.fail('BOOKING_NOT_FOUND');
  end if;

  v_status := private.lock_member(v_uid);
  if v_status <> 'active' then
    perform private.fail('ACCOUNT_SUSPENDED');
  end if;
  select * into v_booking from public.bookings b where b.id = p_booking_id for no key update;

  if v_booking.state = 'checked_in' then
    perform private.fail('ALREADY_CHECKED_IN');
  end if;
  if v_booking.state <> 'confirmed' then
    perform private.fail('BOOKING_NOT_ACTIVE');
  end if;
  if v_now < v_booking.checkin_opens_at or v_now >= v_booking.checkin_closes_at then
    perform private.fail('OUTSIDE_CHECKIN_WINDOW');
  end if;
  if not private.is_venue_public(v_booking.venue_id) then
    perform private.fail('SESSION_NOT_BOOKABLE');
  end if;
  select * into v_membership from public.memberships m where m.id = v_booking.membership_id;
  if v_membership.status <> 'active' or v_membership.ends_at < v_booking.session_ends_at then
    perform private.fail('MEMBERSHIP_REQUIRED');
  end if;

  update public.checkin_tokens t
     set revoked_at = v_now
   where t.booking_id = v_booking.id and t.used_at is null and t.revoked_at is null;

  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  v_expires := v_now + interval '60 seconds';
  insert into public.checkin_tokens (booking_id, token_hash, expires_at)
  values (v_booking.id, sha256(convert_to(v_token, 'UTF8')), v_expires);

  return query select v_token, v_expires;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_order: immutable pending order with the plan version's price snapshot
-- ---------------------------------------------------------------------------
create function public.create_order(p_plan_version_id uuid, p_provider public.payment_provider)
returns table (order_id uuid, amount_minor bigint, currency text, expires_at timestamptz, is_demo boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := private.now();
  v_status public.account_status;
  v_pv public.plan_versions%rowtype;
  v_order public.orders%rowtype;
begin
  if v_uid is null then
    perform private.fail('AUTH_REQUIRED');
  end if;
  if p_plan_version_id is null or p_provider is null then
    perform private.fail('VALIDATION_FAILED');
  end if;
  if not private.rate_limit_hit('checkout:' || v_uid::text, 10, 3600) then
    perform private.fail('RATE_LIMITED');
  end if;

  v_status := private.lock_member(v_uid);
  if v_status <> 'active' then
    perform private.fail('ACCOUNT_SUSPENDED');
  end if;

  select pv.* into v_pv
    from public.plan_versions pv
    join public.plans pl on pl.id = pv.plan_id
   where pv.id = p_plan_version_id and pv.status = 'published' and pl.is_active;
  if not found then
    perform private.fail('PLAN_NOT_AVAILABLE');
  end if;

  if p_provider = 'demo' and not private.setting_bool('demo_payments_enabled', false) then
    perform private.fail('PAYMENT_UNAVAILABLE');
  end if;

  if exists (
    select 1 from public.memberships m
     where m.user_id = v_uid and m.status = 'active' and m.ends_at > v_now
  ) then
    perform private.fail('MEMBERSHIP_ALREADY_ACTIVE');
  end if;

  -- At most one open checkout per member. A late verified success for a superseded order is
  -- still recorded and reconciled by apply_payment_event.
  update public.orders o
     set status = 'cancelled', cancelled_at = v_now
   where o.user_id = v_uid and o.status = 'pending';

  insert into public.orders (user_id, plan_version_id, amount_minor, currency, provider, is_demo, status, expires_at)
  values (v_uid, v_pv.id, v_pv.price_minor, v_pv.currency, p_provider, p_provider = 'demo', 'pending',
          v_now + interval '30 minutes')
  returning * into v_order;

  perform private.audit(
    'member', 'order.create', 'order', v_order.id::text, null, null,
    jsonb_build_object('plan_version_id', v_pv.id, 'amount_minor', v_order.amount_minor,
                       'currency', v_order.currency, 'provider', v_order.provider)
  );

  return query select v_order.id, v_order.amount_minor, v_order.currency::text, v_order.expires_at, v_order.is_demo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    perform private.fail('AUTH_REQUIRED');
  end if;
  update public.notifications n
     set read_at = pg_catalog.now()
   where n.user_id = auth.uid()
     and n.read_at is null
     and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.search_venues(text, text, text, text, date, text, double precision, double precision, public.locale_code, integer, integer) from public;
grant execute on function public.search_venues(text, text, text, text, date, text, double precision, double precision, public.locale_code, integer, integer) to anon, authenticated, service_role;

revoke execute on function
  public.get_my_access(),
  public.get_my_membership(),
  public.get_my_bookings(text, integer, integer),
  public.get_my_booking(uuid),
  public.create_booking(uuid, uuid),
  public.cancel_booking(uuid, boolean),
  public.issue_checkin_token(uuid),
  public.create_order(uuid, public.payment_provider),
  public.mark_notifications_read(uuid[])
  from public, anon;
grant execute on function
  public.get_my_access(),
  public.get_my_membership(),
  public.get_my_bookings(text, integer, integer),
  public.get_my_booking(uuid),
  public.create_booking(uuid, uuid),
  public.cancel_booking(uuid, boolean),
  public.issue_checkin_token(uuid),
  public.create_order(uuid, public.payment_provider),
  public.mark_notifications_read(uuid[])
  to authenticated, service_role;
