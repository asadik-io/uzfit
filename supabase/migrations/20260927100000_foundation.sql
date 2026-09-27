-- UzFit foundation: extensions, private schema, settings, clock, and shared helpers.
--
-- Conventions used by every UzFit migration:
--   * Application tables live in `public` and are protected by RLS plus explicit grants.
--   * Internal state and helpers live in `private`, which is not exposed through the Data API.
--   * Privileged functions are SECURITY DEFINER with `search_path = ''` and fully qualified names.
--   * Default privileges are revoked; every grant is written explicitly.
--   * Domain errors are raised with SQLSTATE P0001 and a stable upper-case code as the message.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, anon, service_role;

-- New objects created by the migration role are not reachable through the Data API unless granted.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Settings (operator-controlled flags; never writable through the Data API)
-- ---------------------------------------------------------------------------
create table private.settings (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table private.settings is
  'Operator flags. Known keys: demo_payments_enabled (bool, default false), '
  'admin_mfa_required (bool, default true), allow_fake_clock (bool, tests only, default false).';

create function private.setting_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case jsonb_typeof(s.value) when 'boolean' then (s.value)::text::boolean else null end
       from private.settings s where s.key = p_key),
    p_default
  );
$$;

-- ---------------------------------------------------------------------------
-- Clock. Business rules use private.now(). Tests may pin the clock only when the
-- operator flag allow_fake_clock is set; the Data API cannot set session GUCs.
-- ---------------------------------------------------------------------------
create function private.now()
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fake text := current_setting('uzfit.fake_now', true);
begin
  if v_fake is not null and v_fake <> '' and private.setting_bool('allow_fake_clock', false) then
    return v_fake::timestamptz;
  end if;
  return pg_catalog.now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Errors
-- ---------------------------------------------------------------------------
-- Volatile on purpose: an immutable raising function could be constant-folded by the planner
-- inside a CASE arm that is never taken.
create function private.fail(p_code text, p_detail text default null)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = p_code,
    detail = coalesce(p_detail, ''),
    hint = 'uzfit_domain_error';
end;
$$;

-- ---------------------------------------------------------------------------
-- Validation helpers used by check constraints
-- ---------------------------------------------------------------------------

-- Localized text: {"uz": "...", "ru": "...", "en": "..."}; Uzbek is required and is the fallback.
create function private.is_localized_text(p_value jsonb, p_max_length integer default 200, p_require_uz boolean default true)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_value) = 'object'
     and not exists (
       select 1 from jsonb_each(p_value) e
        where e.key not in ('uz', 'ru', 'en')
           or jsonb_typeof(e.value) <> 'string'
           or char_length(e.value #>> '{}') > p_max_length
     )
     and (not p_require_uz or char_length(btrim(coalesce(p_value ->> 'uz', ''))) > 0);
$$;

create function private.is_valid_timezone(p_tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_tz is null or p_tz = '' then
    return false;
  end if;
  perform timestamptz '2000-01-01 00:00:00+00' at time zone p_tz;
  return true;
exception when others then
  return false;
end;
$$;

-- E.164; Uzbekistan numbers must have exactly nine national digits.
create function private.is_valid_phone(p_phone text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_phone ~ '^\+[1-9][0-9]{7,14}$'
     and (p_phone !~ '^\+998' or p_phone ~ '^\+998[0-9]{9}$');
$$;

create function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Request context
-- ---------------------------------------------------------------------------

-- Request ID forwarded by the Next.js server through PostgREST (x-request-id header).
create function private.request_id()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers text := current_setting('request.headers', true);
  v_id text;
begin
  if v_headers is null or v_headers = '' then
    return null;
  end if;
  v_id := v_headers::jsonb ->> 'x-request-id';
  return nullif(left(regexp_replace(coalesce(v_id, ''), '[^A-Za-z0-9_-]', '', 'g'), 64), '');
exception when others then
  return null;
end;
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Persistent rate limiting (fixed windows). Shared by serverless instances.
-- ---------------------------------------------------------------------------
create table private.rate_limits (
  bucket text not null check (char_length(bucket) <= 200),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

-- Returns true when the hit is within the limit. The hit is recorded either way.
create function private.rate_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_bucket is null or p_max < 1 or p_window_seconds < 1 then
    perform private.fail('VALIDATION_FAILED', 'invalid rate limit arguments');
  end if;
  v_window := to_timestamp(floor(extract(epoch from pg_catalog.now()) / p_window_seconds) * p_window_seconds);
  insert into private.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  return v_hits <= p_max;
end;
$$;

-- Server-side entry point for limits enforced before calling Supabase Auth (login, sign-up,
-- password reset). Callable only with the server's privileged key.
create function public.consume_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select private.rate_limit_hit(p_bucket, p_max, p_window_seconds);
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Helpers are callable by API roles only where RLS policies or constraints need them.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_localized_text(jsonb, integer, boolean) to anon, authenticated, service_role;
grant execute on function private.is_valid_timezone(text) to anon, authenticated, service_role;
grant execute on function private.is_valid_phone(text) to anon, authenticated, service_role;
grant execute on function private.try_uuid(text) to anon, authenticated, service_role;
