-- UzFit authorization: helper predicates, least-privilege grants, and row level security.
--
-- Read model:
--   * Visitors (anon) read the published catalog: published + active venues of active
--     organizations, their media, hours, activities and sessions, and published plan offers.
--   * Members read their own profile, memberships, bookings, orders, payments, favorites,
--     and notifications.
--   * Partner staff read their organization's venues (any status), drafts, activities and
--     sessions. Rosters and reports are exposed only through minimal-projection functions.
--   * Platform admins read everything (with MFA when admin_mfa_required is on).
-- Write model: API roles have no direct write privileges except their own profile fields,
-- favorites, and notification read receipts. Everything else goes through checked functions.

-- ---------------------------------------------------------------------------
-- Predicates (SECURITY DEFINER so they can be used inside policies without recursion)
-- ---------------------------------------------------------------------------
create function private.is_account_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and exists (
    select 1 from public.account_statuses s where s.user_id = p_user and s.status = 'active'
  );
$$;

-- Holds the admin role (regardless of the current authentication level).
create function private.has_admin_role(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
     and exists (select 1 from public.platform_roles r where r.user_id = p_user and r.role = 'admin')
     and private.is_account_active(p_user);
$$;

create function private.admin_mfa_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.setting_bool('admin_mfa_required', true);
$$;

-- Effective admin authority for the current request: role, active account, and (when required)
-- a second authentication factor verified in this session (JWT aal2).
create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_admin_role(auth.uid())
     and (not private.admin_mfa_required() or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2');
$$;

create function private.is_org_active(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.organizations o where o.id = p_org and o.status = 'active');
$$;

-- Current user holds one of the roles (any role when p_roles is null) in an active organization.
create function private.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.organization_members m
         join public.organizations o on o.id = m.organization_id
        where m.organization_id = p_org
          and m.user_id = auth.uid()
          and o.status = 'active'
          and (p_roles is null or m.role = any (p_roles))
     )
     and private.is_account_active(auth.uid());
$$;

create function private.has_venue_role(p_venue uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.venues v
     where v.id = p_venue and private.has_org_role(v.organization_id, p_roles)
  );
$$;

create function private.is_venue_public(p_venue uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.venues v
      join public.organizations o on o.id = v.organization_id
     where v.id = p_venue
       and v.publication_status = 'published'
       and v.operational_status = 'active'
       and o.status = 'active'
  );
$$;

create function private.can_read_venue(p_venue uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_venue_public(p_venue)
      or private.has_venue_role(p_venue, null)
      or private.is_platform_admin();
$$;

create function private.owns_plan_version(p_plan_version uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.memberships m where m.plan_version_id = p_plan_version and m.user_id = auth.uid())
    or exists (select 1 from public.orders o where o.plan_version_id = p_plan_version and o.user_id = auth.uid())
  );
$$;

create function private.can_read_plan_version(p_plan_version uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.plan_versions pv where pv.id = p_plan_version and pv.status = 'published')
      or private.owns_plan_version(p_plan_version)
      or private.is_platform_admin();
$$;

-- ---------------------------------------------------------------------------
-- Shared transactional helpers
-- ---------------------------------------------------------------------------

-- Lock order used by every operation that changes allowance, capacity, or memberships:
--   1. member coordination rows (public.account_statuses), ascending user_id
--   2. session rows (public.sessions), ascending id
--   3. booking rows, then check-in token rows
-- Returns the member's current account status.
create function private.lock_member(p_user uuid)
returns public.account_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status public.account_status;
begin
  select s.status into v_status from public.account_statuses s where s.user_id = p_user for update;
  if not found then
    if not exists (select 1 from public.profiles p where p.id = p_user) then
      perform private.fail('USER_NOT_FOUND');
    end if;
    insert into public.account_statuses (user_id) values (p_user) on conflict (user_id) do nothing;
    select s.status into v_status from public.account_statuses s where s.user_id = p_user for update;
  end if;
  return v_status;
end;
$$;

-- PERFORM runs the query to completion, so every matching row is locked, in sorted order.
create function private.lock_members(p_users uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform 1 from public.account_statuses s
   where s.user_id = any (coalesce(p_users, '{}'::uuid[]))
   order by s.user_id
     for update;
end;
$$;

create function private.lock_sessions(p_sessions uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform 1 from public.sessions s
   where s.id = any (coalesce(p_sessions, '{}'::uuid[]))
   order by s.id
     for no key update;
end;
$$;

create function private.audit(
  p_actor_role text,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_reason text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, request_id, reason,
    before_data, after_data, metadata
  )
  values (
    auth.uid(), p_actor_role, p_action, p_target_type, p_target_id, private.request_id(), p_reason,
    p_before, p_after, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create function private.notify(p_user uuid, p_key text, p_params jsonb default '{}'::jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, message_key, params)
  values (p_user, p_key, coalesce(p_params, '{}'::jsonb));
$$;

-- Consumed = checked in, late cancellation, or no-show. Reserved = confirmed.
create function private.membership_usage(p_membership uuid, out consumed integer, out reserved integer)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where b.state in ('checked_in', 'cancelled_late', 'no_show'))::integer,
         count(*) filter (where b.state = 'confirmed')::integer
    from public.bookings b
   where b.membership_id = p_membership;
$$;

-- Parameters for notification messages about a booking (no personal data).
create function private.booking_notice_params(p_booking uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'booking_id', b.id,
           'venue_name', v.name,
           'activity_title', a.title,
           'starts_at', b.session_starts_at,
           'timezone', v.timezone
         )
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    join public.activities a on a.id = s.activity_id
    join public.venues v on v.id = b.venue_id
   where b.id = p_booking;
$$;

-- ---------------------------------------------------------------------------
-- Grants: revoke everything, then grant precisely
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant all on all tables in schema private to service_role;

-- Published catalog.
grant select on
  public.cities, public.districts, public.categories, public.amenities,
  public.venues, public.venue_categories, public.venue_amenities, public.venue_images,
  public.venue_opening_hours, public.activities, public.sessions,
  public.plans, public.plan_versions, public.plan_version_venues
  to anon, authenticated;

-- Row-scoped private reads.
grant select on
  public.profiles, public.account_statuses, public.platform_roles,
  public.organizations, public.organization_members, public.venue_revisions,
  public.memberships, public.bookings, public.checkins,
  public.orders, public.payments, public.payment_events,
  public.favorites, public.notifications, public.audit_logs
  to authenticated;

-- The only direct writes available to API roles.
grant update (display_name, phone_e164, locale) on public.profiles to authenticated;
grant insert, delete on public.favorites to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Predicates used inside policies, check constraints, and invoker functions.
grant execute on function
  private.setting_bool(text, boolean),
  private.now(),
  private.is_account_active(uuid),
  private.has_admin_role(uuid),
  private.admin_mfa_required(),
  private.is_platform_admin(),
  private.is_org_active(uuid),
  private.has_org_role(uuid, public.org_role[]),
  private.has_venue_role(uuid, public.org_role[]),
  private.is_venue_public(uuid),
  private.can_read_venue(uuid),
  private.owns_plan_version(uuid),
  private.can_read_plan_version(uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.account_statuses enable row level security;
alter table public.platform_roles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.cities enable row level security;
alter table public.districts enable row level security;
alter table public.categories enable row level security;
alter table public.amenities enable row level security;
alter table public.venues enable row level security;
alter table public.venue_categories enable row level security;
alter table public.venue_amenities enable row level security;
alter table public.venue_images enable row level security;
alter table public.venue_opening_hours enable row level security;
alter table public.venue_revisions enable row level security;
alter table public.activities enable row level security;
alter table public.sessions enable row level security;
alter table public.plans enable row level security;
alter table public.plan_versions enable row level security;
alter table public.plan_version_venues enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.memberships enable row level security;
alter table public.bookings enable row level security;
alter table public.checkin_tokens enable row level security; -- no policies: functions only
alter table public.checkins enable row level security;
alter table public.favorites enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- Reference data
create policy cities_read on public.cities for select to anon, authenticated using (true);
create policy districts_read on public.districts for select to anon, authenticated using (true);
create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy amenities_read on public.amenities for select to anon, authenticated using (true);

-- Catalog
create policy venues_read on public.venues for select to anon, authenticated using (
  (publication_status = 'published' and operational_status = 'active' and private.is_org_active(organization_id))
  or private.has_org_role(organization_id, null)
  or (select private.is_platform_admin())
);
create policy venue_categories_read on public.venue_categories for select to anon, authenticated
  using (private.can_read_venue(venue_id));
create policy venue_amenities_read on public.venue_amenities for select to anon, authenticated
  using (private.can_read_venue(venue_id));
create policy venue_images_read on public.venue_images for select to anon, authenticated
  using (private.can_read_venue(venue_id));
create policy venue_opening_hours_read on public.venue_opening_hours for select to anon, authenticated
  using (private.can_read_venue(venue_id));
create policy activities_read on public.activities for select to anon, authenticated
  using (private.can_read_venue(venue_id));
create policy sessions_read on public.sessions for select to anon, authenticated
  using (private.can_read_venue(venue_id));

create policy plans_read on public.plans for select to anon, authenticated
  using (is_active or (select private.is_platform_admin()));
create policy plan_versions_read on public.plan_versions for select to anon, authenticated using (
  status = 'published' or private.owns_plan_version(id) or (select private.is_platform_admin())
);
create policy plan_version_venues_read on public.plan_version_venues for select to anon, authenticated
  using (private.can_read_plan_version(plan_version_id) and private.can_read_venue(venue_id));

-- Partner drafts: managers of the owning organization and admins.
create policy venue_revisions_read on public.venue_revisions for select to authenticated using (
  private.has_venue_role(venue_id, array['manager']::public.org_role[])
  or (select private.is_platform_admin())
);

-- People and access
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_platform_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy account_statuses_read on public.account_statuses for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));
create policy platform_roles_read on public.platform_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));
create policy organizations_read on public.organizations for select to authenticated
  using (private.has_org_role(id, null) or (select private.is_platform_admin()));
create policy organization_members_read on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));

-- Member records
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));
create policy bookings_read on public.bookings for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));
create policy checkins_read on public.checkins for select to authenticated using (
  (select private.is_platform_admin())
  or exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = (select auth.uid()))
);
create policy orders_read on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));
create policy payments_read on public.payments for select to authenticated using (
  (select private.is_platform_admin())
  or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
);
create policy payment_events_read on public.payment_events for select to authenticated
  using ((select private.is_platform_admin()));

create policy favorites_read on public.favorites for select to authenticated
  using (user_id = (select auth.uid()));
create policy favorites_insert on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_venue_public(venue_id));
create policy favorites_delete on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy audit_logs_read on public.audit_logs for select to authenticated
  using ((select private.is_platform_admin()));
