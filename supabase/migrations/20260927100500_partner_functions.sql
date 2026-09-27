-- UzFit partner functions. Every function re-checks organization-scoped authorization;
-- staff of one organization can never act on another organization's venues.

-- ---------------------------------------------------------------------------
-- Venue content validation (shared by partner drafts and admin approval)
-- ---------------------------------------------------------------------------
create function private.validate_venue_content(p_venue_id uuid, p_content jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids jsonb;
  v_item jsonb;
  v_count integer;
  v_days integer[] := '{}';
  v_path text;
  v_lat jsonb := p_content -> 'latitude';
  v_lng jsonb := p_content -> 'longitude';
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    perform private.fail('INVALID_CONTENT', 'content');
  end if;
  if not private.is_localized_text(p_content -> 'name', 120) then
    perform private.fail('INVALID_CONTENT', 'name');
  end if;
  if not private.is_localized_text(p_content -> 'address', 300) then
    perform private.fail('INVALID_CONTENT', 'address');
  end if;
  if not private.is_localized_text(coalesce(p_content -> 'description', '{"uz":""}'), 4000, false) then
    perform private.fail('INVALID_CONTENT', 'description');
  end if;
  if not private.is_localized_text(coalesce(p_content -> 'rules', '{"uz":""}'), 4000, false) then
    perform private.fail('INVALID_CONTENT', 'rules');
  end if;
  if private.try_uuid(p_content ->> 'district_id') is null
     or not exists (select 1 from public.districts d where d.id = (p_content ->> 'district_id')::uuid) then
    perform private.fail('INVALID_CONTENT', 'district_id');
  end if;

  if (v_lat is null or v_lat = 'null'::jsonb) <> (v_lng is null or v_lng = 'null'::jsonb) then
    perform private.fail('INVALID_CONTENT', 'coordinates');
  end if;
  if v_lat is not null and v_lat <> 'null'::jsonb then
    if jsonb_typeof(v_lat) <> 'number' or jsonb_typeof(v_lng) <> 'number'
       or (v_lat)::text::double precision not between -90 and 90
       or (v_lng)::text::double precision not between -180 and 180 then
      perform private.fail('INVALID_CONTENT', 'coordinates');
    end if;
  end if;

  if p_content ? 'contact_phone' and p_content -> 'contact_phone' <> 'null'::jsonb
     and not private.is_valid_phone(p_content ->> 'contact_phone') then
    perform private.fail('INVALID_CONTENT', 'contact_phone');
  end if;

  -- Categories: 1..6 existing ids.
  v_ids := coalesce(p_content -> 'category_ids', '[]'::jsonb);
  if jsonb_typeof(v_ids) <> 'array' or jsonb_array_length(v_ids) not between 1 and 6 then
    perform private.fail('INVALID_CONTENT', 'category_ids');
  end if;
  select count(*) into v_count
    from jsonb_array_elements_text(v_ids) e
    join public.categories c on c.id = private.try_uuid(e);
  if v_count <> jsonb_array_length(v_ids) then
    perform private.fail('INVALID_CONTENT', 'category_ids');
  end if;

  -- Amenities: 0..20 existing ids.
  v_ids := coalesce(p_content -> 'amenity_ids', '[]'::jsonb);
  if jsonb_typeof(v_ids) <> 'array' or jsonb_array_length(v_ids) > 20 then
    perform private.fail('INVALID_CONTENT', 'amenity_ids');
  end if;
  select count(*) into v_count
    from jsonb_array_elements_text(v_ids) e
    join public.amenities a on a.id = private.try_uuid(e);
  if v_count <> jsonb_array_length(v_ids) then
    perform private.fail('INVALID_CONTENT', 'amenity_ids');
  end if;

  -- Images: up to 12 objects in this venue's own storage folder.
  v_ids := coalesce(p_content -> 'images', '[]'::jsonb);
  if jsonb_typeof(v_ids) <> 'array' or jsonb_array_length(v_ids) > 12 then
    perform private.fail('INVALID_CONTENT', 'images');
  end if;
  for v_item in select * from jsonb_array_elements(v_ids) loop
    v_path := v_item ->> 'path';
    if jsonb_typeof(v_item) <> 'object'
       or v_path is null
       or v_path !~ ('^venues/' || p_venue_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
       or not private.is_localized_text(coalesce(v_item -> 'alt', '{"uz":""}'), 200, false) then
      perform private.fail('INVALID_CONTENT', 'images');
    end if;
  end loop;

  -- Opening hours: exactly one entry per ISO weekday.
  v_ids := coalesce(p_content -> 'opening_hours', '[]'::jsonb);
  if jsonb_typeof(v_ids) <> 'array' or jsonb_array_length(v_ids) <> 7 then
    perform private.fail('INVALID_CONTENT', 'opening_hours');
  end if;
  for v_item in select * from jsonb_array_elements(v_ids) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'weekday') <> 'number'
       or (v_item ->> 'weekday')::integer not between 1 and 7
       or (v_item ->> 'weekday')::integer = any (v_days) then
      perform private.fail('INVALID_CONTENT', 'opening_hours');
    end if;
    v_days := v_days || (v_item ->> 'weekday')::integer;
    if coalesce((v_item ->> 'is_closed')::boolean, false) = false then
      if coalesce(v_item ->> 'opens_at', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or coalesce(v_item ->> 'closes_at', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
         or (v_item ->> 'opens_at')::time >= (v_item ->> 'closes_at')::time then
        perform private.fail('INVALID_CONTENT', 'opening_hours');
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'name', p_content -> 'name',
    'address', p_content -> 'address',
    'description', coalesce(p_content -> 'description', '{"uz":""}'::jsonb),
    'rules', coalesce(p_content -> 'rules', '{"uz":""}'::jsonb),
    'district_id', p_content -> 'district_id',
    'latitude', coalesce(v_lat, 'null'::jsonb),
    'longitude', coalesce(v_lng, 'null'::jsonb),
    'contact_phone', coalesce(p_content -> 'contact_phone', 'null'::jsonb),
    'category_ids', p_content -> 'category_ids',
    'amenity_ids', coalesce(p_content -> 'amenity_ids', '[]'::jsonb),
    'images', coalesce(p_content -> 'images', '[]'::jsonb),
    'opening_hours', p_content -> 'opening_hours'
  );
end;
$$;

create function private.require_staff_account()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    perform private.fail('AUTH_REQUIRED');
  end if;
  if not private.is_account_active(auth.uid()) then
    perform private.fail('ACCOUNT_SUSPENDED');
  end if;
  return auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Venues and drafts
-- ---------------------------------------------------------------------------
create function public.partner_create_venue(p_organization_id uuid, p_slug text, p_content jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff_account();
  v_id uuid := gen_random_uuid();
  v_content jsonb;
begin
  if not private.has_org_role(p_organization_id, array['manager']::public.org_role[]) then
    perform private.fail('FORBIDDEN');
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) not between 3 and 80 then
    perform private.fail('INVALID_CONTENT', 'slug');
  end if;
  if exists (select 1 from public.venues v where v.slug = p_slug) then
    perform private.fail('SLUG_TAKEN');
  end if;
  v_content := private.validate_venue_content(v_id, p_content);

  insert into public.venues (id, organization_id, slug, name, description, address, rules, district_id,
                             latitude, longitude, contact_phone, publication_status)
  values (
    v_id, p_organization_id, p_slug, v_content -> 'name', v_content -> 'description', v_content -> 'address',
    v_content -> 'rules', (v_content ->> 'district_id')::uuid,
    (v_content ->> 'latitude')::double precision, (v_content ->> 'longitude')::double precision,
    v_content ->> 'contact_phone', 'draft'
  );
  insert into public.venue_revisions (venue_id, status, content, created_by)
  values (v_id, 'draft', v_content, v_uid);

  perform private.audit('staff', 'venue.create', 'venue', v_id::text, null, null,
                        jsonb_build_object('organization_id', p_organization_id, 'slug', p_slug));
  return v_id;
end;
$$;

-- Saves the single open draft for a venue. A submitted draft is locked until withdrawn or reviewed.
create function public.partner_save_venue_revision(p_venue_id uuid, p_content jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff_account();
  v_content jsonb;
  v_revision public.venue_revisions%rowtype;
begin
  if not private.has_venue_role(p_venue_id, array['manager']::public.org_role[]) then
    perform private.fail('FORBIDDEN');
  end if;
  v_content := private.validate_venue_content(p_venue_id, p_content);

  select * into v_revision from public.venue_revisions r
   where r.venue_id = p_venue_id and r.status in ('draft', 'submitted')
   for update;
  if found then
    if v_revision.status = 'submitted' then
      perform private.fail('REVISION_LOCKED');
    end if;
    update public.venue_revisions r set content = v_content where r.id = v_revision.id;
    return v_revision.id;
  end if;

  insert into public.venue_revisions (venue_id, status, content, created_by)
  values (p_venue_id, 'draft', v_content, v_uid)
  returning id into v_revision.id;
  return v_revision.id;
end;
$$;

create function public.partner_submit_venue_revision(p_venue_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff_account();
  v_id uuid;
begin
  if not private.has_venue_role(p_venue_id, array['manager']::public.org_role[]) then
    perform private.fail('FORBIDDEN');
  end if;
  update public.venue_revisions r
     set status = 'submitted', submitted_at = pg_catalog.now(), submitted_by = v_uid
   where r.venue_id = p_venue_id and r.status = 'draft'
  returning r.id into v_id;
  if v_id is null then
    perform private.fail('REVISION_NOT_FOUND');
  end if;
  -- Re-validate: referenced categories, districts, or images may have changed since saving.
  perform private.validate_venue_content(p_venue_id, (select r.content from public.venue_revisions r where r.id = v_id));
  perform private.audit('staff', 'venue_revision.submit', 'venue_revision', v_id::text, null, null,
                        jsonb_build_object('venue_id', p_venue_id));
  return v_id;
end;
$$;

create function public.partner_withdraw_venue_revision(p_venue_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_staff_account();
  if not private.has_venue_role(p_venue_id, array['manager']::public.org_role[]) then
    perform private.fail('FORBIDDEN');
  end if;
  update public.venue_revisions r
     set status = 'draft', submitted_at = null, submitted_by = null
   where r.venue_id = p_venue_id and r.status = 'submitted'
  returning r.id into v_id;
  if v_id is null then
    perform private.fail('REVISION_NOT_FOUND');
  end if;
  perform private.audit('staff', 'venue_revision.withdraw', 'venue_revision', v_id::text);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------------
create function public.partner_create_activity(
  p_venue_id uuid,
  p_category_id uuid,
  p_kind public.activity_kind,
  p_title jsonb,
  p_description jsonb,
  p_duration_minutes integer,
  p_default_capacity integer
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_staff_account();
  if not private.has_venue_role(p_venue_id, array['manager']::public.org_role[]) then
    perform private.fail('FORBIDDEN');
  end if;
  if not private.is_localized_text(p_title, 120)
     or not private.is_localized_text(coalesce(p_description, '{"uz":""}'), 2000, false)
     or p_duration_minutes not between 15 and 480
     or p_default_capacity not between 1 and 500
     or p_kind is null
     or not exists (select 1 from public.categories c where c.id = p_category_id) then
    perform private.fail('VALIDATION_FAILED');
  end if;
  insert into public.activities (venue_id, category_id, kind, title, description, duration_minutes, default_capacity)
  values (p_venue_id, p_category_id, p_kind, p_title, coalesce(p_description, '{"uz":""}'),
          p_duration_minutes, p_default_capacity)
  returning id into v_id;
  perform private.audit('staff', 'activity.create', 'activity', v_id::text, null, null,
                        jsonb_build_object('venue_id', p_venue_id, 'kind', p_kind));
  return v_id;
end;
$$;

-- Duration changes apply only to sessions created afterwards; existing session times never change.
create function public.partner_update_activity(
  p_activity_id uuid,
  p_title jsonb,
  p_description jsonb,
  p_duration_minutes integer,
  p_default_capacity integer,
  p_is_active boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_activity public.activities%rowtype;
begin
  perform private.require_staff_account();
  select * into v_activity from public.activities a where a.id = p_activity_id for no key update;
  if not found or not private.has_venue_role(v_activity.venue_id, array['manager']::public.org_role[]) then
    perform private.fail('FORBIDDEN');
  end if;
  if not private.is_localized_text(p_title, 120)
     or not private.is_localized_text(coalesce(p_description, '{"uz":""}'), 2000, false)
     or p_duration_minutes not between 15 and 480
     or p_default_capacity not between 1 and 500
     or p_is_active is null then
    perform private.fail('VALIDATION_FAILED');
  end if;
  update public.activities a
     set title = p_title, description = coalesce(p_description, '{"uz":""}'),
         duration_minutes = p_duration_minutes, default_capacity = p_default_capacity, is_active = p_is_active
   where a.id = p_activity_id;
  perform private.audit('staff', 'activity.update', 'activity', p_activity_id::text, null,
                        to_jsonb(v_activity) - 'created_at' - 'updated_at',
                        jsonb_build_object('duration_minutes', p_duration_minutes,
                                           'default_capacity', p_default_capacity, 'is_active', p_is_active));
end;
$$;

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------
create unique index sessions_activity_start_scheduled_idx
  on public.sessions (activity_id, starts_at) where status = 'scheduled';

-- Creates sessions from local wall-clock start times interpreted in the venue timezone.
create function public.partner_create_sessions(p_activity_id uuid, p_local_starts timestamp[], p_capacity integer default null)
returns setof uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff_account();
  v_now timestamptz := private.now();
  v_activity public.activities%rowtype;
  v_tz text;
  v_local timestamp;
  v_start timestamptz;
  v_capacity integer;
  v_id uuid;
  v_created uuid[] := '{}';
begin
  select * into v_activity from public.activities a where a.id = p_activity_id;
  if not found or not private.has_venue_role(v_activity.venue_id, array['manager']::public.org_role[]) then
    perform private.fail('FORBIDDEN');
  end if;
  if not v_activity.is_active then
    perform private.fail('ACTIVITY_INACTIVE');
  end if;
  if p_local_starts is null or cardinality(p_local_starts) not between 1 and 60 then
    perform private.fail('VALIDATION_FAILED', 'between 1 and 60 start times');
  end if;
  v_capacity := coalesce(p_capacity, v_activity.default_capacity);
  if v_capacity not between 1 and 500 then
    perform private.fail('VALIDATION_FAILED', 'capacity');
  end if;
  select v.timezone into v_tz from public.venues v where v.id = v_activity.venue_id;

  foreach v_local in array p_local_starts loop
    v_start := v_local at time zone v_tz;
    if v_start <= v_now then
      perform private.fail('SESSION_IN_PAST');
    end if;
    if v_start > v_now + interval '90 days' then
      perform private.fail('VALIDATION_FAILED', 'sessions can be scheduled up to 90 days ahead');
    end if;
    if exists (
      select 1 from public.sessions s
       where s.activity_id = v_activity.id and s.starts_at = v_start and s.status = 'scheduled'
    ) then
      perform private.fail('SESSION_DUPLICATE');
    end if;
    insert into public.sessions (venue_id, activity_id, starts_at, ends_at, capacity, created_by)
    values (v_activity.venue_id, v_activity.id, v_start,
            v_start + make_interval(mins => v_activity.duration_minutes), v_capacity, v_uid)
    returning id into v_id;
    v_created := v_created || v_id;
  end loop;

  perform private.audit('staff', 'session.create', 'activity', v_activity.id::text, null, null,
                        jsonb_build_object('session_ids', to_jsonb(v_created), 'capacity', v_capacity));
  return query select unnest(v_created);
end;
$$;

-- Capacity can grow freely but never drop below occupied places.
create function public.partner_update_session_capacity(p_session_id uuid, p_capacity integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
begin
  perform private.require_staff_account();
  select * into v_session from public.sessions s where s.id = p_session_id;
  if not found or not private.has_venue_role(v_session.venue_id, array['manager']::public.org_role[]) then
    perform private.fail('FORBIDDEN');
  end if;
  if p_capacity is null or p_capacity not between 1 and 500 then
    perform private.fail('VALIDATION_FAILED');
  end if;
  select * into v_session from public.sessions s where s.id = p_session_id for no key update;
  if v_session.status <> 'scheduled' then
    perform private.fail('SESSION_CANCELLED');
  end if;
  if v_session.ends_at <= private.now() then
    perform private.fail('SESSION_ENDED');
  end if;
  if p_capacity < v_session.occupied_count then
    perform private.fail('CAPACITY_BELOW_OCCUPIED');
  end if;
  update public.sessions s set capacity = p_capacity where s.id = p_session_id;
  perform private.audit('staff', 'session.capacity', 'session', p_session_id::text, null,
                        jsonb_build_object('capacity', v_session.capacity),
                        jsonb_build_object('capacity', p_capacity));
end;
$$;

-- Venue cancellation of a set of sessions. Lock protocol: lock every affected member (ascending),
-- then the sessions (ascending); if a reservation by a not-yet-locked member appeared in between,
-- roll back to the savepoint (releasing those locks) and retry with the larger member set.
create function private.venue_cancel_sessions(
  p_session_ids uuid[],
  p_reason text,
  p_actor_role text,
  p_source public.cancellation_source
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_members uuid[];
  v_members_after uuid[];
  v_attempt integer := 0;
  v_booking record;
  v_count integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    begin
      select coalesce(array_agg(distinct b.user_id), '{}') into v_members
        from public.bookings b
       where b.session_id = any (p_session_ids) and b.state = 'confirmed';
      perform private.lock_members(v_members);
      perform private.lock_sessions(p_session_ids);
      select coalesce(array_agg(distinct b.user_id), '{}') into v_members_after
        from public.bookings b
       where b.session_id = any (p_session_ids) and b.state = 'confirmed';
      if not (v_members_after <@ v_members) then
        raise exception using errcode = 'UZRTY', message = 'member set changed';
      end if;
      exit;
    exception when sqlstate 'UZRTY' then
      if v_attempt >= 5 then
        perform private.fail('CONCURRENT_UPDATE');
      end if;
    end;
  end loop;

  update public.sessions s
     set status = 'cancelled', cancellation_reason = p_reason, cancelled_at = v_now, cancelled_by = auth.uid()
   where s.id = any (p_session_ids) and s.status = 'scheduled';

  -- Still-confirmed reservations are released; completed attendance is preserved.
  for v_booking in
    update public.bookings b
       set state = 'venue_cancelled', cancelled_at = v_now, cancelled_by = auth.uid(),
           cancellation_source = p_source, cancellation_reason = p_reason
     where b.session_id = any (p_session_ids) and b.state = 'confirmed'
    returning b.id, b.user_id
  loop
    v_count := v_count + 1;
    update public.checkin_tokens t set revoked_at = v_now
     where t.booking_id = v_booking.id and t.used_at is null and t.revoked_at is null;
    perform private.notify(v_booking.user_id, 'booking_venue_cancelled',
                           private.booking_notice_params(v_booking.id) || jsonb_build_object('reason', p_reason));
  end loop;

  perform private.audit(p_actor_role, 'session.cancel', 'session', array_to_string(p_session_ids, ','), p_reason,
                        null, null, jsonb_build_object('released_bookings', v_count));
  return v_count;
end;
$$;

create function public.cancel_session(p_session_id uuid, p_reason text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
  v_role text;
begin
  perform private.require_staff_account();
  select * into v_session from public.sessions s where s.id = p_session_id;
  if not found then
    perform private.fail('SESSION_NOT_FOUND');
  end if;
  if private.has_venue_role(v_session.venue_id, array['manager']::public.org_role[]) then
    v_role := 'staff';
  elsif private.is_platform_admin() then
    v_role := 'admin';
  else
    perform private.fail('FORBIDDEN');
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 500 then
    perform private.fail('REASON_REQUIRED');
  end if;
  if v_session.status = 'cancelled' then
    return 0;
  end if;
  if v_session.ends_at <= private.now() then
    perform private.fail('SESSION_ENDED');
  end if;
  return private.venue_cancel_sessions(array[p_session_id], btrim(p_reason), v_role, 'venue');
end;
$$;

-- ---------------------------------------------------------------------------
-- Operational views for staff (minimal member projection)
-- ---------------------------------------------------------------------------
create function public.get_session_roster(p_session_id uuid)
returns table (
  booking_id uuid,
  member_display_name text,
  booking_state public.booking_state,
  booked_at timestamptz,
  checked_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_venue uuid;
begin
  perform private.require_staff_account();
  select s.venue_id into v_venue from public.sessions s where s.id = p_session_id;
  if v_venue is null or not (private.has_venue_role(v_venue, null) or private.is_platform_admin()) then
    perform private.fail('FORBIDDEN');
  end if;
  return query
    select b.id,
           case when p.anonymized_at is not null then '' else p.display_name end,
           b.state, b.created_at, b.checked_in_at
      from public.bookings b
      join public.profiles p on p.id = b.user_id
     where b.session_id = p_session_id
       and b.state <> 'cancelled_on_time'
     order by b.created_at;
end;
$$;

create function public.partner_day_sessions(p_venue_id uuid, p_date date)
returns table (
  session_id uuid,
  activity_id uuid,
  activity_title jsonb,
  activity_kind public.activity_kind,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity integer,
  status public.session_status,
  cancellation_reason text,
  confirmed_count integer,
  checked_in_count integer,
  no_show_count integer,
  late_cancel_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
begin
  perform private.require_staff_account();
  if not (private.has_venue_role(p_venue_id, null) or private.is_platform_admin()) then
    perform private.fail('FORBIDDEN');
  end if;
  select v.timezone into v_tz from public.venues v where v.id = p_venue_id;
  return query
    select s.id, a.id, a.title, a.kind, s.starts_at, s.ends_at, s.capacity, s.status, s.cancellation_reason,
           count(b.id) filter (where b.state = 'confirmed')::integer,
           count(b.id) filter (where b.state = 'checked_in')::integer,
           count(b.id) filter (where b.state = 'no_show')::integer,
           count(b.id) filter (where b.state = 'cancelled_late')::integer
      from public.sessions s
      join public.activities a on a.id = s.activity_id
      left join public.bookings b on b.session_id = s.id
     where s.venue_id = p_venue_id
       and s.starts_at >= (p_date::timestamp at time zone v_tz)
       and s.starts_at < ((p_date + 1)::timestamp at time zone v_tz)
     group by s.id, a.id
     order by s.starts_at, s.id;
end;
$$;

-- Attendance export rows (at most 93 days). Only operationally necessary member data.
create function public.partner_attendance_report(p_venue_id uuid, p_from date, p_to date)
returns table (
  local_date date,
  session_starts_at timestamptz,
  activity_title jsonb,
  booking_id uuid,
  member_display_name text,
  booking_state public.booking_state,
  checked_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_staff_account();
  if not (private.has_venue_role(p_venue_id, array['manager']::public.org_role[]) or private.is_platform_admin()) then
    perform private.fail('FORBIDDEN');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    perform private.fail('VALIDATION_FAILED', 'date range up to 93 days');
  end if;
  return query
    select b.local_date, b.session_starts_at, a.title, b.id,
           case when p.anonymized_at is not null then '' else p.display_name end,
           b.state, b.checked_in_at
      from public.bookings b
      join public.sessions s on s.id = b.session_id
      join public.activities a on a.id = s.activity_id
      join public.profiles p on p.id = b.user_id
     where b.venue_id = p_venue_id
       and b.local_date between p_from and p_to
       and b.state in ('confirmed', 'checked_in', 'no_show', 'cancelled_late', 'venue_cancelled')
     order by b.session_starts_at, b.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- QR redemption. Business failures are returned (not raised) so the persistent rate-limit hit
-- is committed and failed attempts count toward the limit. No state changes on failure.
-- ---------------------------------------------------------------------------
create function public.redeem_checkin_token(p_token text, p_venue_id uuid)
returns table (
  ok boolean,
  error_code text,
  booking_id uuid,
  member_display_name text,
  activity_title jsonb,
  session_starts_at timestamptz,
  checked_in_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := private.now();
  v_raw text;
  v_token_id uuid;
  v_booking_id uuid;
  v_member uuid;
  v_session_id uuid;
  v_token_venue uuid;
  v_booking public.bookings%rowtype;
  v_token public.checkin_tokens%rowtype;
  v_membership public.memberships%rowtype;
  v_name text;
  v_title jsonb;
begin
  if v_uid is null then
    return query select false, 'AUTH_REQUIRED', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;
  if not private.rate_limit_hit('checkin_redeem:' || v_uid::text, 120, 60) then
    return query select false, 'RATE_LIMITED', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;
  if p_venue_id is null or not private.has_venue_role(p_venue_id, null) then
    return query select false, 'FORBIDDEN', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_raw := btrim(coalesce(p_token, ''));
  if v_raw like 'UZFIT1:%' then
    v_raw := substr(v_raw, 8);
  end if;
  if v_raw !~ '^[A-Za-z0-9_-]{43}$' then
    return query select false, 'TOKEN_INVALID', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;

  select t.id, t.booking_id, b.user_id, b.session_id, b.venue_id
    into v_token_id, v_booking_id, v_member, v_session_id, v_token_venue
    from public.checkin_tokens t
    join public.bookings b on b.id = t.booking_id
   where t.token_hash = sha256(convert_to(v_raw, 'UTF8'));
  if not found then
    return query select false, 'TOKEN_INVALID', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_token_venue <> p_venue_id then
    return query select false, 'WRONG_VENUE', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- Lock order: member, session, booking, token.
  perform private.lock_member(v_member);
  perform 1 from public.sessions s where s.id = v_session_id for no key update;
  select * into v_booking from public.bookings b where b.id = v_booking_id for no key update;
  select * into v_token from public.checkin_tokens t where t.id = v_token_id for no key update;

  if v_token.used_at is not null then
    return query select false, 'TOKEN_ALREADY_USED', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_token.revoked_at is not null then
    return query select false, 'TOKEN_INVALID', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_token.expires_at <= v_now then
    return query select false, 'TOKEN_EXPIRED', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_booking.state = 'checked_in' then
    return query select false, 'ALREADY_CHECKED_IN', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_booking.state <> 'confirmed' then
    return query select false, 'BOOKING_NOT_ACTIVE', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_now < v_booking.checkin_opens_at or v_now >= v_booking.checkin_closes_at then
    return query select false, 'OUTSIDE_CHECKIN_WINDOW', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;
  if not private.is_venue_public(p_venue_id) then
    return query select false, 'SESSION_NOT_BOOKABLE', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;
  select * into v_membership from public.memberships m where m.id = v_booking.membership_id;
  if v_membership.status <> 'active' or v_membership.ends_at < v_booking.session_ends_at then
    return query select false, 'MEMBERSHIP_REQUIRED', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;
  if not private.is_account_active(v_member) then
    return query select false, 'ACCOUNT_SUSPENDED', null::uuid, null::text, null::jsonb, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- Atomically consume the token, check the booking in, and record attendance.
  update public.checkin_tokens t set used_at = v_now, used_by = v_uid where t.id = v_token.id;
  update public.bookings b set state = 'checked_in', checked_in_at = v_now where b.id = v_booking.id;
  insert into public.checkins (booking_id, venue_id, checked_in_at, verified_by, token_id)
  values (v_booking.id, p_venue_id, v_now, v_uid, v_token.id);

  select case when p.anonymized_at is not null then '' else p.display_name end into v_name
    from public.profiles p where p.id = v_member;
  select a.title into v_title
    from public.sessions s join public.activities a on a.id = s.activity_id where s.id = v_session_id;

  perform private.notify(v_member, 'checkin_completed', private.booking_notice_params(v_booking.id));
  perform private.audit('staff', 'booking.check_in', 'booking', v_booking.id::text, null,
                        jsonb_build_object('state', 'confirmed'), jsonb_build_object('state', 'checked_in'),
                        jsonb_build_object('venue_id', p_venue_id));

  return query select true, null::text, v_booking.id, v_name, v_title, v_booking.session_starts_at, v_now;
end;
$$;

revoke execute on function
  public.partner_create_venue(uuid, text, jsonb),
  public.partner_save_venue_revision(uuid, jsonb),
  public.partner_submit_venue_revision(uuid),
  public.partner_withdraw_venue_revision(uuid),
  public.partner_create_activity(uuid, uuid, public.activity_kind, jsonb, jsonb, integer, integer),
  public.partner_update_activity(uuid, jsonb, jsonb, integer, integer, boolean),
  public.partner_create_sessions(uuid, timestamp[], integer),
  public.partner_update_session_capacity(uuid, integer),
  public.cancel_session(uuid, text),
  public.get_session_roster(uuid),
  public.partner_day_sessions(uuid, date),
  public.partner_attendance_report(uuid, date, date),
  public.redeem_checkin_token(text, uuid)
  from public, anon;
grant execute on function
  public.partner_create_venue(uuid, text, jsonb),
  public.partner_save_venue_revision(uuid, jsonb),
  public.partner_submit_venue_revision(uuid),
  public.partner_withdraw_venue_revision(uuid),
  public.partner_create_activity(uuid, uuid, public.activity_kind, jsonb, jsonb, integer, integer),
  public.partner_update_activity(uuid, jsonb, jsonb, integer, integer, boolean),
  public.partner_create_sessions(uuid, timestamp[], integer),
  public.partner_update_session_capacity(uuid, integer),
  public.cancel_session(uuid, text),
  public.get_session_roster(uuid),
  public.partner_day_sessions(uuid, date),
  public.partner_attendance_report(uuid, date, date),
  public.redeem_checkin_token(text, uuid)
  to authenticated, service_role;
