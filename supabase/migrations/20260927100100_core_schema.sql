-- UzFit core schema: types, tables, constraints, and indexes.
-- Instants are timestamptz (UTC). Money is integer minor units (tiyin) with explicit currency.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.locale_code as enum ('uz', 'ru', 'en');
create type public.account_status as enum ('active', 'suspended');
create type public.platform_role as enum ('admin');
create type public.org_status as enum ('active', 'suspended');
create type public.org_role as enum ('manager', 'receptionist');
create type public.venue_publication_status as enum ('draft', 'published', 'unpublished');
create type public.venue_operational_status as enum ('active', 'suspended');
create type public.revision_status as enum ('draft', 'submitted', 'approved', 'rejected');
create type public.activity_kind as enum ('class', 'open_gym');
create type public.session_status as enum ('scheduled', 'cancelled');
create type public.plan_version_status as enum ('draft', 'published', 'retired');
create type public.membership_status as enum ('active', 'revoked');
create type public.membership_source as enum ('payment', 'demo', 'admin');
create type public.booking_state as enum (
  'confirmed', 'checked_in', 'cancelled_on_time', 'cancelled_late', 'venue_cancelled', 'no_show'
);
create type public.cancellation_source as enum ('member', 'venue', 'admin', 'system');
create type public.order_status as enum ('pending', 'paid', 'failed', 'cancelled', 'refunded');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
create type public.payment_provider as enum ('demo', 'payme', 'click');
create type public.payment_event_outcome as enum ('processed', 'duplicate', 'ignored', 'rejected');

-- ---------------------------------------------------------------------------
-- People and access
-- ---------------------------------------------------------------------------

-- Deleting an auth user is restricted while a profile exists: accounts with history must be
-- anonymized (see docs/operations.md) so reservations, attendance and payments are retained.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text not null default '' check (char_length(display_name) <= 80),
  phone_e164 text check (phone_e164 is null or private.is_valid_phone(phone_e164)),
  locale public.locale_code not null default 'uz',
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per user. Also the member's entitlement coordination row: every operation that
-- changes a member's allowance, reservations or memberships locks it first.
create table public.account_statuses (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status public.account_status not null default 'active',
  reason text check (reason is null or char_length(reason) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint account_statuses_suspension_reason check (status = 'active' or reason is not null)
);

create table public.platform_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.platform_role not null default 'admin',
  created_at timestamptz not null default now(),
  created_by uuid
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status public.org_status not null default 'active',
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- ---------------------------------------------------------------------------
-- Discovery reference data
-- ---------------------------------------------------------------------------
create table public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name jsonb not null check (private.is_localized_text(name, 80)),
  timezone text not null default 'Asia/Tashkent' check (private.is_valid_timezone(timezone)),
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name jsonb not null check (private.is_localized_text(name, 80)),
  sort_order integer not null default 0,
  unique (city_id, slug)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name jsonb not null check (private.is_localized_text(name, 80)),
  icon text not null default 'dumbbell' check (icon ~ '^[a-z0-9-]+$'),
  sort_order integer not null default 0
);

create table public.amenities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name jsonb not null check (private.is_localized_text(name, 80)),
  icon text not null default 'check' check (icon ~ '^[a-z0-9-]+$'),
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  name jsonb not null check (private.is_localized_text(name, 120)),
  description jsonb not null default '{"uz": ""}'::jsonb
    check (private.is_localized_text(description, 4000, false)),
  address jsonb not null check (private.is_localized_text(address, 300)),
  rules jsonb not null default '{"uz": ""}'::jsonb check (private.is_localized_text(rules, 4000, false)),
  district_id uuid not null references public.districts (id),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  timezone text not null default 'Asia/Tashkent' check (private.is_valid_timezone(timezone)),
  contact_phone text check (contact_phone is null or private.is_valid_phone(contact_phone)),
  publication_status public.venue_publication_status not null default 'draft',
  operational_status public.venue_operational_status not null default 'active',
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  is_demo boolean not null default false,
  search_text text generated always as (
    lower(coalesce(name ->> 'uz', '') || ' ' || coalesce(name ->> 'ru', '') || ' ' || coalesce(name ->> 'en', ''))
  ) stored,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_coordinates_pair check ((latitude is null) = (longitude is null))
);
create index venues_organization_idx on public.venues (organization_id);
create index venues_district_idx on public.venues (district_id);
create index venues_public_idx on public.venues (publication_status, operational_status);

create table public.venue_categories (
  venue_id uuid not null references public.venues (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  primary key (venue_id, category_id)
);
create index venue_categories_category_idx on public.venue_categories (category_id);

create table public.venue_amenities (
  venue_id uuid not null references public.venues (id) on delete cascade,
  amenity_id uuid not null references public.amenities (id),
  primary key (venue_id, amenity_id)
);

-- Objects live in the public `venue-media` bucket at venues/<venue_id>/<uuid>.<ext>.
create table public.venue_images (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  storage_path text not null
    check (storage_path ~ '^venues/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  alt jsonb not null default '{"uz": ""}'::jsonb check (private.is_localized_text(alt, 200, false)),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (venue_id, storage_path)
);
create index venue_images_venue_idx on public.venue_images (venue_id, sort_order);

-- ISO weekday: 1 = Monday ... 7 = Sunday. Times are local to the venue timezone.
create table public.venue_opening_hours (
  venue_id uuid not null references public.venues (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  primary key (venue_id, weekday),
  constraint venue_opening_hours_interval check (
    is_closed or (opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

-- Partner-proposed content. Published venue content stays unchanged until an admin approves.
create table public.venue_revisions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  status public.revision_status not null default 'draft',
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  submitted_by uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_note text check (review_note is null or char_length(review_note) <= 1000)
);
create unique index venue_revisions_one_open_idx
  on public.venue_revisions (venue_id) where status in ('draft', 'submitted');
create index venue_revisions_submitted_idx
  on public.venue_revisions (submitted_at) where status = 'submitted';

-- ---------------------------------------------------------------------------
-- Activities and sessions
-- ---------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id),
  category_id uuid not null references public.categories (id),
  kind public.activity_kind not null,
  title jsonb not null check (private.is_localized_text(title, 120)),
  description jsonb not null default '{"uz": ""}'::jsonb
    check (private.is_localized_text(description, 2000, false)),
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  default_capacity integer not null check (default_capacity between 1 and 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, venue_id)
);
create index activities_venue_idx on public.activities (venue_id);

-- Session times are immutable (cancel and recreate instead). occupied_count is maintained by a
-- trigger on bookings and bounded by capacity, so overbooking is impossible at the row level.
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id),
  activity_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 500),
  occupied_count integer not null default 0 check (occupied_count >= 0),
  status public.session_status not null default 'scheduled',
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  cancelled_at timestamptz,
  cancelled_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (activity_id, venue_id) references public.activities (id, venue_id),
  constraint sessions_time_order check (ends_at > starts_at),
  constraint sessions_max_duration check (ends_at - starts_at <= interval '8 hours'),
  constraint sessions_capacity_occupied check (occupied_count <= capacity),
  constraint sessions_cancellation check (
    (status = 'scheduled' and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and cancellation_reason is not null)
  )
);
create index sessions_venue_start_idx on public.sessions (venue_id, starts_at);
create index sessions_activity_idx on public.sessions (activity_id);
create index sessions_scheduled_start_idx on public.sessions (starts_at) where status = 'scheduled';

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- A published version is an immutable offer; memberships reference the exact version bought.
create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id),
  version integer not null check (version > 0),
  status public.plan_version_status not null default 'draft',
  name jsonb not null check (private.is_localized_text(name, 80)),
  description jsonb not null default '{"uz": ""}'::jsonb
    check (private.is_localized_text(description, 1000, false)),
  price_minor bigint not null check (price_minor >= 0),
  currency char(3) not null default 'UZS' check (currency = 'UZS'),
  duration_days integer not null check (duration_days between 1 and 366),
  visit_allowance integer not null check (visit_allowance between 1 and 1000),
  daily_visit_limit integer not null default 1 check (daily_visit_limit between 1 and 10),
  max_future_bookings integer not null default 3 check (max_future_bookings between 1 and 50),
  booking_window_days integer not null default 7 check (booking_window_days between 1 and 60),
  free_cancellation_minutes integer not null default 120 check (free_cancellation_minutes between 0 and 10080),
  checkin_opens_minutes integer not null default 15 check (checkin_opens_minutes between 0 and 240),
  checkin_closes_minutes integer not null default 30 check (checkin_closes_minutes between 1 and 240),
  is_demo boolean not null default false,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (plan_id, version)
);
create unique index plan_versions_one_published_idx on public.plan_versions (plan_id) where status = 'published';

create table public.plan_version_venues (
  plan_version_id uuid not null references public.plan_versions (id),
  venue_id uuid not null references public.venues (id),
  primary key (plan_version_id, venue_id)
);
create index plan_version_venues_venue_idx on public.plan_version_venues (venue_id);

-- ---------------------------------------------------------------------------
-- Orders and payments
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  plan_version_id uuid not null references public.plan_versions (id),
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null check (currency = 'UZS'),
  provider public.payment_provider not null,
  is_demo boolean not null default false,
  status public.order_status not null default 'pending',
  needs_reconciliation boolean not null default false,
  reconciliation_note text check (reconciliation_note is null or char_length(reconciliation_note) <= 1000),
  expires_at timestamptz not null,
  paid_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  refund_reference text check (refund_reference is null or char_length(refund_reference) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_demo_provider check (is_demo = (provider = 'demo'))
);
create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_pending_idx on public.orders (created_at) where status = 'pending';
create index orders_reconciliation_idx on public.orders (created_at) where needs_reconciliation;
create index orders_paid_at_idx on public.orders (paid_at) where paid_at is not null;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  provider public.payment_provider not null,
  provider_transaction_id text not null check (char_length(provider_transaction_id) between 1 and 200),
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null,
  status public.payment_status not null,
  succeeded_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_transaction_id)
);
create index payments_order_idx on public.payments (order_id);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider public.payment_provider not null,
  dedup_key text not null check (char_length(dedup_key) between 1 and 300),
  event_type text not null check (char_length(event_type) between 1 and 100),
  order_id uuid references public.orders (id),
  payment_id uuid references public.payments (id),
  provider_transaction_id text check (provider_transaction_id is null or char_length(provider_transaction_id) <= 200),
  outcome public.payment_event_outcome not null,
  outcome_code text check (outcome_code is null or char_length(outcome_code) <= 100),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  received_at timestamptz not null default now(),
  unique (provider, dedup_key)
);
create index payment_events_order_idx on public.payment_events (order_id);
create index payment_events_received_idx on public.payment_events (received_at desc);

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  plan_version_id uuid not null references public.plan_versions (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.membership_status not null default 'active',
  source public.membership_source not null,
  order_id uuid unique references public.orders (id),
  is_demo boolean not null default false,
  granted_by uuid,
  grant_reason text check (grant_reason is null or char_length(grant_reason) <= 500),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 500),
  created_at timestamptz not null default now(),
  constraint memberships_interval check (ends_at > starts_at),
  constraint memberships_revocation check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null and revoke_reason is not null)
  ),
  constraint memberships_source_order check (
    (source in ('payment', 'demo')) = (order_id is not null)
  ),
  constraint memberships_admin_reason check (source <> 'admin' or grant_reason is not null),
  -- Backstop for the serialized entitlement operations: active memberships never overlap.
  constraint memberships_no_overlap exclude using gist (
    user_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'active')
);
create index memberships_user_validity_idx on public.memberships (user_id, ends_at desc);
create index memberships_plan_version_idx on public.memberships (plan_version_id);

-- ---------------------------------------------------------------------------
-- Bookings, check-in tokens, attendance
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  session_id uuid not null references public.sessions (id),
  membership_id uuid not null references public.memberships (id),
  venue_id uuid not null references public.venues (id),
  state public.booking_state not null default 'confirmed',
  -- Local calendar date of the session start in the venue timezone.
  local_date date not null,
  -- Snapshots of immutable session times and of the policy applied at booking time.
  session_starts_at timestamptz not null,
  session_ends_at timestamptz not null,
  cancellation_deadline timestamptz not null,
  checkin_opens_at timestamptz not null,
  checkin_closes_at timestamptz not null,
  policy_snapshot jsonb not null check (jsonb_typeof(policy_snapshot) = 'object'),
  idempotency_key uuid not null,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_source public.cancellation_source,
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  checked_in_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  constraint bookings_session_times check (session_ends_at > session_starts_at),
  constraint bookings_checkin_window check (checkin_closes_at > checkin_opens_at),
  constraint bookings_cancellation_fields check (
    (state in ('cancelled_on_time', 'cancelled_late', 'venue_cancelled'))
      = (cancelled_at is not null and cancellation_source is not null)
  ),
  constraint bookings_checkin_fields check ((state = 'checked_in') = (checked_in_at is not null))
);
-- At most one live (confirmed or checked-in) reservation per member and session.
create unique index bookings_one_live_idx
  on public.bookings (user_id, session_id) where state in ('confirmed', 'checked_in');
create index bookings_user_state_idx on public.bookings (user_id, state, session_starts_at);
create index bookings_session_state_idx on public.bookings (session_id, state);
create index bookings_membership_state_idx on public.bookings (membership_id, state);
create index bookings_venue_date_idx on public.bookings (venue_id, local_date);
create index bookings_confirmed_end_idx on public.bookings (session_ends_at) where state = 'confirmed';

-- Only the SHA-256 hash of a check-in token is stored; the raw token exists only in the QR code.
create table public.checkin_tokens (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index checkin_tokens_open_idx on public.checkin_tokens (booking_id) where used_at is null and revoked_at is null;

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id),
  venue_id uuid not null references public.venues (id),
  checked_in_at timestamptz not null,
  verified_by uuid not null,
  token_id uuid references public.checkin_tokens (id),
  created_at timestamptz not null default now()
);
create index checkins_venue_time_idx on public.checkins (venue_id, checked_in_at);

-- ---------------------------------------------------------------------------
-- Member conveniences, notifications, and audit
-- ---------------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);
create index favorites_venue_idx on public.favorites (venue_id);

-- Persistent in-app notices. message_key is a translation key; params are non-sensitive values.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_key text not null check (message_key ~ '^[a-z_]+$'),
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_role text not null check (actor_role in ('member', 'staff', 'admin', 'system')),
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  target_type text not null check (target_type ~ '^[a-z_]+$'),
  target_id text,
  request_id text,
  reason text check (reason is null or char_length(reason) <= 1000),
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
