-- UzFit maintenance jobs and venue media storage.
--
-- Jobs are idempotent, process bounded batches, and tolerate missed runs: entitlement and
-- booking rules are enforced from timestamps on every request, independent of these jobs.

-- ---------------------------------------------------------------------------
-- No-show finalization: confirmed reservations whose session has ended become no-shows.
-- ---------------------------------------------------------------------------
create function public.reconcile_no_shows(p_limit integer default 200)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_ids uuid[];
  v_users uuid[];
  v_sessions uuid[];
  v_booking record;
  v_count integer := 0;
begin
  select array_agg(c.id), array_agg(distinct c.user_id), array_agg(distinct c.session_id)
    into v_ids, v_users, v_sessions
    from (
      select b.id, b.user_id, b.session_id
        from public.bookings b
       where b.state = 'confirmed' and b.session_ends_at <= v_now
       order by b.session_ends_at, b.id
       limit least(greatest(coalesce(p_limit, 200), 1), 2000)
    ) c;
  if v_ids is null then
    return 0;
  end if;

  -- Same lock order as every other entitlement operation: members, then sessions, then bookings.
  perform private.lock_members(v_users);
  perform private.lock_sessions(v_sessions);

  for v_booking in
    update public.bookings b
       set state = 'no_show', finalized_at = v_now
     where b.id = any (v_ids) and b.state = 'confirmed' and b.session_ends_at <= v_now
    returning b.id, b.user_id
  loop
    v_count := v_count + 1;
    update public.checkin_tokens t set revoked_at = v_now
     where t.booking_id = v_booking.id and t.used_at is null and t.revoked_at is null;
    perform private.notify(v_booking.user_id, 'no_show_recorded', private.booking_notice_params(v_booking.id));
  end loop;

  if v_count > 0 then
    perform private.audit('system', 'booking.no_show_batch', 'booking', null, null, null, null,
                          jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;

-- Removes short-lived records that have no audit value: expired rate-limit windows and
-- check-in tokens that were never used. Used tokens stay linked to attendance records.
create function public.cleanup_ephemeral_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rate integer;
  v_tokens integer;
begin
  delete from private.rate_limits r where r.window_start < pg_catalog.now() - interval '2 days';
  get diagnostics v_rate = row_count;
  delete from public.checkin_tokens t
   where t.used_at is null and t.expires_at < pg_catalog.now() - interval '7 days';
  get diagnostics v_tokens = row_count;
  return jsonb_build_object('rate_limit_windows', v_rate, 'checkin_tokens', v_tokens);
end;
$$;

-- Monitoring: sessions whose maintained occupancy differs from their live reservations.
create function public.session_occupancy_drift()
returns table (session_id uuid, occupied_count integer, live_reservations integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.occupied_count, count(b.id)::integer
    from public.sessions s
    left join public.bookings b on b.session_id = s.id and b.state in ('confirmed', 'checked_in')
   group by s.id
  having s.occupied_count <> count(b.id);
$$;

revoke execute on function
  public.reconcile_no_shows(integer),
  public.cleanup_ephemeral_data(),
  public.session_occupancy_drift()
  from public, anon, authenticated;
grant execute on function
  public.reconcile_no_shows(integer),
  public.cleanup_ephemeral_data(),
  public.session_occupancy_drift()
  to service_role;

-- ---------------------------------------------------------------------------
-- Venue media: public raster images in venues/<venue_id>/<uuid>.<ext>.
-- The server verifies the actual content type (magic bytes) and size before uploading with the
-- manager's own session; these policies enforce ownership and path server-side as well.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('venue-media', 'venue-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create function private.can_manage_venue_media(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_object_name ~ '^venues/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
     and private.has_venue_role(private.try_uuid(split_part(p_object_name, '/', 2)), array['manager']::public.org_role[]);
$$;

-- Published images cannot be replaced or deleted in place; publish a revision instead.
create function private.is_published_venue_media(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.venue_images vi where vi.storage_path = p_object_name);
$$;

grant execute on function
  private.can_manage_venue_media(text),
  private.is_published_venue_media(text)
  to authenticated, service_role;

create policy venue_media_manager_read on storage.objects for select to authenticated
  using (bucket_id = 'venue-media' and private.can_manage_venue_media(name));
create policy venue_media_manager_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'venue-media' and private.can_manage_venue_media(name));
create policy venue_media_manager_update on storage.objects for update to authenticated
  using (bucket_id = 'venue-media' and private.can_manage_venue_media(name) and not private.is_published_venue_media(name))
  with check (bucket_id = 'venue-media' and private.can_manage_venue_media(name));
create policy venue_media_manager_delete on storage.objects for delete to authenticated
  using (bucket_id = 'venue-media' and private.can_manage_venue_media(name) and not private.is_published_venue_media(name));
