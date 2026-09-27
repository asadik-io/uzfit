-- UzFit platform-admin functions. Every operation requires the admin role on an active account
-- (plus aal2 when admin_mfa_required is on), requires a reason where it changes a member's
-- entitlement or visibility, and writes an audit entry in the same transaction.

create function private.require_admin()
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
  if not private.has_admin_role(auth.uid()) then
    perform private.fail('FORBIDDEN');
  end if;
  if not private.is_platform_admin() then
    perform private.fail('MFA_REQUIRED');
  end if;
  return auth.uid();
end;
$$;

create function private.require_reason(p_reason text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 500 then
    perform private.fail('REASON_REQUIRED');
  end if;
  return btrim(p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Membership revocation core (also used by refunds and anonymization).
-- Releases the membership's future confirmed reservations; completed attendance is preserved.
-- ---------------------------------------------------------------------------
create function private.revoke_membership_core(p_membership_id uuid, p_reason text, p_actor_role text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_user uuid;
  v_membership public.memberships%rowtype;
  v_sessions uuid[];
  v_booking record;
  v_count integer := 0;
begin
  select m.user_id into v_user from public.memberships m where m.id = p_membership_id;
  if v_user is null then
    perform private.fail('MEMBERSHIP_NOT_FOUND');
  end if;
  perform private.lock_member(v_user);
  select * into v_membership from public.memberships m where m.id = p_membership_id for no key update;
  if v_membership.status = 'revoked' then
    return 0;
  end if;

  select array_agg(distinct b.session_id) into v_sessions
    from public.bookings b
   where b.membership_id = p_membership_id and b.state = 'confirmed' and b.session_ends_at > v_now;
  perform private.lock_sessions(v_sessions);

  for v_booking in
    update public.bookings b
       set state = 'cancelled_on_time', cancelled_at = v_now, cancelled_by = auth.uid(),
           cancellation_source = 'admin', cancellation_reason = 'membership_revoked'
     where b.membership_id = p_membership_id and b.state = 'confirmed' and b.session_ends_at > v_now
    returning b.id
  loop
    v_count := v_count + 1;
    update public.checkin_tokens t set revoked_at = v_now
     where t.booking_id = v_booking.id and t.used_at is null and t.revoked_at is null;
  end loop;

  update public.memberships m
     set status = 'revoked', revoked_at = v_now, revoked_by = auth.uid(), revoke_reason = p_reason
   where m.id = p_membership_id;

  perform private.notify(v_user, 'membership_revoked',
                         jsonb_build_object('membership_id', p_membership_id, 'released_bookings', v_count));
  perform private.audit(p_actor_role, 'membership.revoke', 'membership', p_membership_id::text, p_reason,
                        jsonb_build_object('status', 'active'), jsonb_build_object('status', 'revoked'),
                        jsonb_build_object('released_bookings', v_count, 'user_id', v_user));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------
create function public.admin_set_venue_status(
  p_venue_id uuid,
  p_action text,
  p_reason text default null,
  p_cancel_future_sessions boolean default false
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue public.venues%rowtype;
  v_reason text;
  v_sessions uuid[];
  v_released integer := 0;
begin
  perform private.require_admin();
  select * into v_venue from public.venues v where v.id = p_venue_id for no key update;
  if not found then
    perform private.fail('VENUE_NOT_FOUND');
  end if;

  case p_action
    when 'publish' then
      -- A never-published draft is published by approving its first revision.
      if v_venue.publication_status <> 'unpublished' then
        perform private.fail('INVALID_TRANSITION');
      end if;
      update public.venues v set publication_status = 'published', published_at = pg_catalog.now(), status_reason = null
       where v.id = p_venue_id;
    when 'unpublish' then
      v_reason := private.require_reason(p_reason);
      if v_venue.publication_status <> 'published' then
        perform private.fail('INVALID_TRANSITION');
      end if;
      update public.venues v set publication_status = 'unpublished', status_reason = v_reason where v.id = p_venue_id;
    when 'suspend' then
      v_reason := private.require_reason(p_reason);
      if v_venue.operational_status = 'suspended' then
        perform private.fail('INVALID_TRANSITION');
      end if;
      update public.venues v set operational_status = 'suspended', status_reason = v_reason where v.id = p_venue_id;
    when 'reinstate' then
      if v_venue.operational_status <> 'suspended' then
        perform private.fail('INVALID_TRANSITION');
      end if;
      update public.venues v set operational_status = 'active', status_reason = null where v.id = p_venue_id;
    else
      perform private.fail('VALIDATION_FAILED', 'unknown action');
  end case;

  if coalesce(p_cancel_future_sessions, false) and p_action in ('unpublish', 'suspend') then
    select array_agg(s.id) into v_sessions
      from public.sessions s
     where s.venue_id = p_venue_id and s.status = 'scheduled' and s.ends_at > private.now();
    if v_sessions is not null then
      v_released := private.venue_cancel_sessions(v_sessions, v_reason, 'admin', 'admin');
    end if;
  end if;

  perform private.audit('admin', 'venue.' || p_action, 'venue', p_venue_id::text, v_reason,
                        jsonb_build_object('publication_status', v_venue.publication_status,
                                           'operational_status', v_venue.operational_status),
                        null, jsonb_build_object('released_bookings', v_released));
  return v_released;
end;
$$;

-- Approving applies the reviewed content atomically; the first approval publishes a draft venue.
create function public.admin_review_venue_revision(p_revision_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
  v_revision public.venue_revisions%rowtype;
  v_venue public.venues%rowtype;
  v_content jsonb;
begin
  select * into v_revision from public.venue_revisions r where r.id = p_revision_id for update;
  if not found then
    perform private.fail('REVISION_NOT_FOUND');
  end if;
  if v_revision.status <> 'submitted' then
    perform private.fail('REVISION_NOT_SUBMITTED');
  end if;

  if not coalesce(p_approve, false) then
    update public.venue_revisions r
       set status = 'rejected', reviewed_at = pg_catalog.now(), reviewed_by = v_uid,
           review_note = private.require_reason(p_note)
     where r.id = p_revision_id;
    perform private.audit('admin', 'venue_revision.reject', 'venue_revision', p_revision_id::text, p_note);
    return;
  end if;

  v_content := private.validate_venue_content(v_revision.venue_id, v_revision.content);
  select * into v_venue from public.venues v where v.id = v_revision.venue_id for no key update;

  update public.venues v
     set name = v_content -> 'name',
         description = v_content -> 'description',
         address = v_content -> 'address',
         rules = v_content -> 'rules',
         district_id = (v_content ->> 'district_id')::uuid,
         latitude = (v_content ->> 'latitude')::double precision,
         longitude = (v_content ->> 'longitude')::double precision,
         contact_phone = v_content ->> 'contact_phone',
         publication_status = case when v.publication_status = 'draft' then 'published' else v.publication_status end,
         published_at = case when v.publication_status = 'draft' then pg_catalog.now() else v.published_at end
   where v.id = v_venue.id;

  delete from public.venue_categories x where x.venue_id = v_venue.id;
  insert into public.venue_categories (venue_id, category_id)
  select v_venue.id, e::uuid from jsonb_array_elements_text(v_content -> 'category_ids') e
  on conflict do nothing;

  delete from public.venue_amenities x where x.venue_id = v_venue.id;
  insert into public.venue_amenities (venue_id, amenity_id)
  select v_venue.id, e::uuid from jsonb_array_elements_text(v_content -> 'amenity_ids') e
  on conflict do nothing;

  delete from public.venue_images x where x.venue_id = v_venue.id;
  insert into public.venue_images (venue_id, storage_path, alt, sort_order)
  select v_venue.id, e.value ->> 'path', coalesce(e.value -> 'alt', '{"uz":""}'::jsonb), (e.ordinality - 1)::integer
    from jsonb_array_elements(v_content -> 'images') with ordinality e
  on conflict (venue_id, storage_path) do nothing;

  delete from public.venue_opening_hours x where x.venue_id = v_venue.id;
  insert into public.venue_opening_hours (venue_id, weekday, opens_at, closes_at, is_closed)
  select v_venue.id, (e ->> 'weekday')::smallint,
         case when coalesce((e ->> 'is_closed')::boolean, false) then null else (e ->> 'opens_at')::time end,
         case when coalesce((e ->> 'is_closed')::boolean, false) then null else (e ->> 'closes_at')::time end,
         coalesce((e ->> 'is_closed')::boolean, false)
    from jsonb_array_elements(v_content -> 'opening_hours') e;

  update public.venue_revisions r
     set status = 'approved', reviewed_at = pg_catalog.now(), reviewed_by = v_uid, review_note = p_note
   where r.id = p_revision_id;

  perform private.audit('admin', 'venue_revision.approve', 'venue_revision', p_revision_id::text, p_note,
                        jsonb_build_object('venue_id', v_venue.id, 'publication_status', v_venue.publication_status),
                        v_content);
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizations and staff
-- ---------------------------------------------------------------------------
create function public.admin_create_organization(p_name text, p_is_demo boolean default false)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_admin();
  if p_name is null or char_length(btrim(p_name)) not between 2 and 120 then
    perform private.fail('VALIDATION_FAILED');
  end if;
  insert into public.organizations (name, is_demo) values (btrim(p_name), coalesce(p_is_demo, false))
  returning id into v_id;
  perform private.audit('admin', 'organization.create', 'organization', v_id::text, null, null,
                        jsonb_build_object('name', btrim(p_name)));
  return v_id;
end;
$$;

create function public.admin_set_organization_status(p_organization_id uuid, p_status public.org_status, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
  v_old public.org_status;
begin
  perform private.require_admin();
  select o.status into v_old from public.organizations o where o.id = p_organization_id for no key update;
  if v_old is null then
    perform private.fail('ORGANIZATION_NOT_FOUND');
  end if;
  update public.organizations o
     set status = p_status, status_reason = case when p_status = 'active' then null else v_reason end
   where o.id = p_organization_id;
  perform private.audit('admin', 'organization.status', 'organization', p_organization_id::text, v_reason,
                        jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end;
$$;

create function public.admin_set_org_member(p_organization_id uuid, p_user_id uuid, p_role public.org_role)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
  v_old public.org_role;
begin
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    perform private.fail('ORGANIZATION_NOT_FOUND');
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.anonymized_at is null) then
    perform private.fail('USER_NOT_FOUND');
  end if;
  if p_role is null then
    perform private.fail('VALIDATION_FAILED');
  end if;
  select m.role into v_old from public.organization_members m
   where m.organization_id = p_organization_id and m.user_id = p_user_id;
  insert into public.organization_members (organization_id, user_id, role, created_by)
  values (p_organization_id, p_user_id, p_role, v_uid)
  on conflict (organization_id, user_id) do update set role = excluded.role;
  perform private.audit('admin', 'organization.member_set', 'organization', p_organization_id::text, null,
                        case when v_old is null then null else jsonb_build_object('user_id', p_user_id, 'role', v_old) end,
                        jsonb_build_object('user_id', p_user_id, 'role', p_role));
end;
$$;

create function public.admin_remove_org_member(p_organization_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old public.org_role;
begin
  perform private.require_admin();
  delete from public.organization_members m
   where m.organization_id = p_organization_id and m.user_id = p_user_id
  returning m.role into v_old;
  if v_old is null then
    perform private.fail('NOT_FOUND');
  end if;
  perform private.audit('admin', 'organization.member_remove', 'organization', p_organization_id::text, null,
                        jsonb_build_object('user_id', p_user_id, 'role', v_old), null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create function public.admin_find_users(p_query text default null)
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  account_status public.account_status,
  is_admin boolean,
  organization_count integer,
  current_plan_code text,
  current_membership_ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text;
begin
  perform private.require_admin();
  v_q := nullif(replace(replace(replace(lower(left(btrim(coalesce(p_query, '')), 120)), '\', '\\'), '%', '\%'), '_', '\_'), '');
  return query
    select u.id, u.email::text, p.display_name, u.created_at, u.email_confirmed_at, s.status,
           exists (select 1 from public.platform_roles r where r.user_id = u.id),
           (select count(*)::integer from public.organization_members m where m.user_id = u.id),
           cm.code, cm.ends_at
      from auth.users u
      join public.profiles p on p.id = u.id
      left join public.account_statuses s on s.user_id = u.id
      left join lateral (
        select pl.code, m.ends_at
          from public.memberships m
          join public.plan_versions pv on pv.id = m.plan_version_id
          join public.plans pl on pl.id = pv.plan_id
         where m.user_id = u.id and m.status = 'active' and m.starts_at <= private.now() and private.now() < m.ends_at
         order by m.starts_at desc limit 1
      ) cm on true
     where v_q is null
        or lower(u.email) like '%' || v_q || '%' escape '\'
        or lower(p.display_name) like '%' || v_q || '%' escape '\'
     order by u.created_at desc
     limit 25;
end;
$$;

create function public.admin_user_summary(p_user_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  phone_e164 text,
  locale public.locale_code,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  account_status public.account_status,
  status_reason text,
  is_admin boolean,
  anonymized_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
    select u.id, u.email::text, p.display_name, p.phone_e164, p.locale, u.created_at, u.email_confirmed_at,
           u.last_sign_in_at, s.status, s.reason,
           exists (select 1 from public.platform_roles r where r.user_id = u.id),
           p.anonymized_at
      from auth.users u
      join public.profiles p on p.id = u.id
      left join public.account_statuses s on s.user_id = u.id
     where u.id = p_user_id;
end;
$$;

create function public.admin_set_account_status(p_user_id uuid, p_status public.account_status, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
  v_reason text := private.require_reason(p_reason);
  v_old public.account_status;
begin
  if p_user_id = v_uid and p_status = 'suspended' then
    perform private.fail('FORBIDDEN', 'admins cannot suspend themselves');
  end if;
  v_old := private.lock_member(p_user_id);
  update public.account_statuses s
     set status = p_status, reason = case when p_status = 'active' then null else v_reason end, updated_by = v_uid
   where s.user_id = p_user_id;
  perform private.audit('admin', 'account.status', 'user', p_user_id::text, v_reason,
                        jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end;
$$;

-- Documented retention process: personal fields are scrubbed and access removed, while
-- reservations, attendance, and payment records are retained. The server then soft-deletes
-- the auth user through the Auth admin API.
create function public.admin_anonymize_user(p_user_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
  v_reason text := private.require_reason(p_reason);
  v_membership uuid;
begin
  if p_user_id = v_uid then
    perform private.fail('FORBIDDEN', 'admins cannot anonymize themselves');
  end if;
  perform private.lock_member(p_user_id);
  for v_membership in
    select m.id from public.memberships m where m.user_id = p_user_id and m.status = 'active' and m.ends_at > private.now()
  loop
    perform private.revoke_membership_core(v_membership, 'account anonymized', 'admin');
  end loop;
  update public.profiles p
     set display_name = '', phone_e164 = null, anonymized_at = pg_catalog.now()
   where p.id = p_user_id;
  update public.account_statuses s
     set status = 'suspended', reason = 'anonymized', updated_by = v_uid
   where s.user_id = p_user_id;
  delete from public.favorites f where f.user_id = p_user_id;
  delete from public.notifications n where n.user_id = p_user_id;
  delete from public.organization_members m where m.user_id = p_user_id;
  delete from public.platform_roles r where r.user_id = p_user_id;
  perform private.audit('admin', 'account.anonymize', 'user', p_user_id::text, v_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------
create function public.admin_grant_membership(p_user_id uuid, p_plan_version_id uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
  v_reason text := private.require_reason(p_reason);
  v_now timestamptz := private.now();
  v_pv public.plan_versions%rowtype;
  v_id uuid;
begin
  select * into v_pv from public.plan_versions pv where pv.id = p_plan_version_id and pv.status = 'published';
  if not found then
    perform private.fail('PLAN_NOT_AVAILABLE');
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.anonymized_at is null) then
    perform private.fail('USER_NOT_FOUND');
  end if;
  perform private.lock_member(p_user_id);
  if exists (
    select 1 from public.memberships m where m.user_id = p_user_id and m.status = 'active' and m.ends_at > v_now
  ) then
    perform private.fail('MEMBERSHIP_ALREADY_ACTIVE');
  end if;
  insert into public.memberships (user_id, plan_version_id, starts_at, ends_at, status, source, is_demo, granted_by, grant_reason)
  values (p_user_id, v_pv.id, v_now, v_now + make_interval(days => v_pv.duration_days), 'active', 'admin',
          v_pv.is_demo, v_uid, v_reason)
  returning id into v_id;
  perform private.notify(p_user_id, 'membership_granted',
                         jsonb_build_object('membership_id', v_id, 'plan_name', v_pv.name));
  perform private.audit('admin', 'membership.grant', 'membership', v_id::text, v_reason, null,
                        jsonb_build_object('user_id', p_user_id, 'plan_version_id', v_pv.id));
  return v_id;
end;
$$;

create function public.admin_revoke_membership(p_membership_id uuid, p_reason text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
begin
  perform private.require_admin();
  return private.revoke_membership_core(p_membership_id, v_reason, 'admin');
end;
$$;

-- Allowed corrections of final states, each audited with a reason.
create function public.admin_correct_booking(p_booking_id uuid, p_new_state public.booking_state, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
  v_reason text := private.require_reason(p_reason);
  v_now timestamptz := private.now();
  v_user uuid;
  v_session uuid;
  v_booking public.bookings%rowtype;
begin
  select b.user_id, b.session_id into v_user, v_session from public.bookings b where b.id = p_booking_id;
  if v_user is null then
    perform private.fail('BOOKING_NOT_FOUND');
  end if;
  perform private.lock_member(v_user);
  perform 1 from public.sessions s where s.id = v_session for no key update;
  select * into v_booking from public.bookings b where b.id = p_booking_id for no key update;

  if not (
       (v_booking.state = 'no_show' and p_new_state in ('checked_in', 'cancelled_on_time'))
    or (v_booking.state = 'cancelled_late' and p_new_state = 'cancelled_on_time')
  ) then
    perform private.fail('INVALID_TRANSITION');
  end if;

  perform set_config('uzfit.booking_correction', 'on', true);
  if p_new_state = 'checked_in' then
    update public.bookings b set state = 'checked_in', checked_in_at = b.session_starts_at where b.id = p_booking_id;
    insert into public.checkins (booking_id, venue_id, checked_in_at, verified_by)
    values (p_booking_id, v_booking.venue_id, v_booking.session_starts_at, v_uid)
    on conflict (booking_id) do nothing;
  else
    update public.bookings b
       set state = 'cancelled_on_time',
           cancelled_at = coalesce(b.cancelled_at, v_now),
           cancelled_by = v_uid,
           cancellation_source = 'admin',
           cancellation_reason = v_reason
     where b.id = p_booking_id;
  end if;
  perform set_config('uzfit.booking_correction', 'off', true);

  perform private.audit('admin', 'booking.correct', 'booking', p_booking_id::text, v_reason,
                        jsonb_build_object('state', v_booking.state), jsonb_build_object('state', p_new_state));
end;
$$;

-- ---------------------------------------------------------------------------
-- Plans (published versions are immutable; changes create a new version)
-- ---------------------------------------------------------------------------
create function public.admin_create_plan(p_code text, p_sort_order integer default 0)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_admin();
  if p_code is null or p_code !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_code) > 40 then
    perform private.fail('VALIDATION_FAILED');
  end if;
  if exists (select 1 from public.plans p where p.code = p_code) then
    perform private.fail('PLAN_CODE_TAKEN');
  end if;
  insert into public.plans (code, sort_order) values (p_code, coalesce(p_sort_order, 0)) returning id into v_id;
  perform private.audit('admin', 'plan.create', 'plan', v_id::text, null, null, jsonb_build_object('code', p_code));
  return v_id;
end;
$$;

create function public.admin_create_plan_version(p_plan_id uuid, p_terms jsonb, p_venue_ids uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
  v_id uuid;
  v_version integer;
  v_count integer;
begin
  perform 1 from public.plans p where p.id = p_plan_id for no key update;
  if not found then
    perform private.fail('PLAN_NOT_FOUND');
  end if;
  if p_terms is null or jsonb_typeof(p_terms) <> 'object' then
    perform private.fail('VALIDATION_FAILED');
  end if;
  select count(*) into v_count from public.venues v where v.id = any (coalesce(p_venue_ids, '{}'));
  if coalesce(cardinality(p_venue_ids), 0) = 0 or v_count <> cardinality(array(select distinct unnest(p_venue_ids))) then
    perform private.fail('VALIDATION_FAILED', 'venue_ids');
  end if;
  select coalesce(max(pv.version), 0) + 1 into v_version from public.plan_versions pv where pv.plan_id = p_plan_id;

  begin
    insert into public.plan_versions (
      plan_id, version, status, name, description, price_minor, currency, duration_days, visit_allowance,
      daily_visit_limit, max_future_bookings, booking_window_days, free_cancellation_minutes,
      checkin_opens_minutes, checkin_closes_minutes, is_demo, created_by
    )
    values (
      p_plan_id, v_version, 'draft', p_terms -> 'name', coalesce(p_terms -> 'description', '{"uz":""}'),
      (p_terms ->> 'price_minor')::bigint, 'UZS', (p_terms ->> 'duration_days')::integer,
      (p_terms ->> 'visit_allowance')::integer,
      coalesce((p_terms ->> 'daily_visit_limit')::integer, 1),
      coalesce((p_terms ->> 'max_future_bookings')::integer, 3),
      coalesce((p_terms ->> 'booking_window_days')::integer, 7),
      coalesce((p_terms ->> 'free_cancellation_minutes')::integer, 120),
      coalesce((p_terms ->> 'checkin_opens_minutes')::integer, 15),
      coalesce((p_terms ->> 'checkin_closes_minutes')::integer, 30),
      coalesce((p_terms ->> 'is_demo')::boolean, false),
      v_uid
    )
    returning id into v_id;
  exception
    when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
      perform private.fail('VALIDATION_FAILED', 'plan terms');
  end;

  insert into public.plan_version_venues (plan_version_id, venue_id)
  select v_id, x from (select distinct unnest(p_venue_ids) as x) d;

  perform private.audit('admin', 'plan_version.create', 'plan_version', v_id::text, null, null,
                        p_terms || jsonb_build_object('version', v_version, 'venue_count', cardinality(p_venue_ids)));
  return v_id;
end;
$$;

create function public.admin_delete_plan_version_draft(p_plan_version_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.plan_versions pv where pv.id = p_plan_version_id and pv.status = 'draft') then
    perform private.fail('PLAN_VERSION_IMMUTABLE');
  end if;
  delete from public.plan_version_venues x where x.plan_version_id = p_plan_version_id;
  delete from public.plan_versions pv where pv.id = p_plan_version_id;
  perform private.audit('admin', 'plan_version.delete_draft', 'plan_version', p_plan_version_id::text);
end;
$$;

-- Publishing a version retires the plan's previously published version. Existing memberships
-- keep referencing the version they bought.
create function public.admin_publish_plan_version(p_plan_version_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pv public.plan_versions%rowtype;
  v_previous uuid;
begin
  perform private.require_admin();
  select * into v_pv from public.plan_versions pv where pv.id = p_plan_version_id;
  if not found then
    perform private.fail('PLAN_VERSION_NOT_FOUND');
  end if;
  perform 1 from public.plans p where p.id = v_pv.plan_id for no key update;
  select * into v_pv from public.plan_versions pv where pv.id = p_plan_version_id for no key update;
  if v_pv.status <> 'draft' then
    perform private.fail('PLAN_VERSION_IMMUTABLE');
  end if;
  if not exists (select 1 from public.plan_version_venues x where x.plan_version_id = p_plan_version_id) then
    perform private.fail('VALIDATION_FAILED', 'a plan version needs at least one venue');
  end if;
  update public.plan_versions pv set status = 'retired', retired_at = pg_catalog.now()
   where pv.plan_id = v_pv.plan_id and pv.status = 'published'
  returning pv.id into v_previous;
  update public.plan_versions pv set status = 'published', published_at = pg_catalog.now()
   where pv.id = p_plan_version_id;
  perform private.audit('admin', 'plan_version.publish', 'plan_version', p_plan_version_id::text, null,
                        case when v_previous is null then null else jsonb_build_object('retired_version_id', v_previous) end,
                        jsonb_build_object('status', 'published'));
end;
$$;

create function public.admin_retire_plan_version(p_plan_version_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.plan_versions pv set status = 'retired', retired_at = pg_catalog.now()
   where pv.id = p_plan_version_id and pv.status = 'published';
  if not found then
    perform private.fail('INVALID_TRANSITION');
  end if;
  perform private.audit('admin', 'plan_version.retire', 'plan_version', p_plan_version_id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Operational totals. Collected and refunded money excludes demo activity, reported separately.
-- ---------------------------------------------------------------------------
create function public.admin_operational_totals(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_admin();
  if p_from is null or p_to is null or p_to <= p_from then
    perform private.fail('VALIDATION_FAILED', 'date range');
  end if;
  select jsonb_build_object(
    'collected_minor', coalesce((select sum(p.amount_minor) from public.payments p join public.orders o on o.id = p.order_id
                                  where not o.is_demo and p.succeeded_at >= p_from and p.succeeded_at < p_to), 0),
    'collected_count', (select count(*) from public.payments p join public.orders o on o.id = p.order_id
                         where not o.is_demo and p.succeeded_at >= p_from and p.succeeded_at < p_to),
    'refunded_minor', coalesce((select sum(p.amount_minor) from public.payments p join public.orders o on o.id = p.order_id
                                 where not o.is_demo and p.status = 'refunded' and p.refunded_at >= p_from and p.refunded_at < p_to), 0),
    'refunded_count', (select count(*) from public.payments p join public.orders o on o.id = p.order_id
                        where not o.is_demo and p.status = 'refunded' and p.refunded_at >= p_from and p.refunded_at < p_to),
    'demo_payments_count', (select count(*) from public.payments p join public.orders o on o.id = p.order_id
                             where o.is_demo and p.succeeded_at >= p_from and p.succeeded_at < p_to),
    'memberships_payment', (select count(*) from public.memberships m where m.source = 'payment' and m.created_at >= p_from and m.created_at < p_to),
    'memberships_demo', (select count(*) from public.memberships m where m.source = 'demo' and m.created_at >= p_from and m.created_at < p_to),
    'memberships_admin', (select count(*) from public.memberships m where m.source = 'admin' and m.created_at >= p_from and m.created_at < p_to),
    'bookings_created', (select count(*) from public.bookings b where b.created_at >= p_from and b.created_at < p_to),
    'checkins', (select count(*) from public.checkins c where c.checked_in_at >= p_from and c.checked_in_at < p_to),
    'no_shows', (select count(*) from public.bookings b where b.state = 'no_show' and b.session_starts_at >= p_from and b.session_starts_at < p_to),
    'late_cancellations', (select count(*) from public.bookings b where b.state = 'cancelled_late' and b.cancelled_at >= p_from and b.cancelled_at < p_to),
    'venue_cancellations', (select count(*) from public.bookings b where b.state = 'venue_cancelled' and b.cancelled_at >= p_from and b.cancelled_at < p_to),
    'orders_needing_reconciliation', (select count(*) from public.orders o where o.needs_reconciliation),
    'pending_orders', (select count(*) from public.orders o where o.status = 'pending'),
    'submitted_revisions', (select count(*) from public.venue_revisions r where r.status = 'submitted')
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function
  public.admin_set_venue_status(uuid, text, text, boolean),
  public.admin_review_venue_revision(uuid, boolean, text),
  public.admin_create_organization(text, boolean),
  public.admin_set_organization_status(uuid, public.org_status, text),
  public.admin_set_org_member(uuid, uuid, public.org_role),
  public.admin_remove_org_member(uuid, uuid),
  public.admin_find_users(text),
  public.admin_user_summary(uuid),
  public.admin_set_account_status(uuid, public.account_status, text),
  public.admin_anonymize_user(uuid, text),
  public.admin_grant_membership(uuid, uuid, text),
  public.admin_revoke_membership(uuid, text),
  public.admin_correct_booking(uuid, public.booking_state, text),
  public.admin_create_plan(text, integer),
  public.admin_create_plan_version(uuid, jsonb, uuid[]),
  public.admin_delete_plan_version_draft(uuid),
  public.admin_publish_plan_version(uuid),
  public.admin_retire_plan_version(uuid),
  public.admin_operational_totals(timestamptz, timestamptz)
  from public, anon;
grant execute on function
  public.admin_set_venue_status(uuid, text, text, boolean),
  public.admin_review_venue_revision(uuid, boolean, text),
  public.admin_create_organization(text, boolean),
  public.admin_set_organization_status(uuid, public.org_status, text),
  public.admin_set_org_member(uuid, uuid, public.org_role),
  public.admin_remove_org_member(uuid, uuid),
  public.admin_find_users(text),
  public.admin_user_summary(uuid),
  public.admin_set_account_status(uuid, public.account_status, text),
  public.admin_anonymize_user(uuid, text),
  public.admin_grant_membership(uuid, uuid, text),
  public.admin_revoke_membership(uuid, text),
  public.admin_correct_booking(uuid, public.booking_state, text),
  public.admin_create_plan(text, integer),
  public.admin_create_plan_version(uuid, jsonb, uuid[]),
  public.admin_delete_plan_version_draft(uuid),
  public.admin_publish_plan_version(uuid),
  public.admin_retire_plan_version(uuid),
  public.admin_operational_totals(timestamptz, timestamptz)
  to authenticated, service_role;
