-- Community join requests (free + private).
--
-- Goal:
-- - Private communities can be discoverable, but joining a free private community
--   requires an explicit request that an admin/owner approves.
-- - Denied requests have a fixed cooldown (7 days) before re-requesting.

create table if not exists public.community_join_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending','approved','denied')),
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  denied_until timestamptz,
  unique (community_id, user_id)
);

create index if not exists idx_community_join_requests_community_status_created
  on public.community_join_requests(community_id, status, created_at asc);

create index if not exists idx_community_join_requests_user
  on public.community_join_requests(user_id, updated_at desc);

-- Read my request state (slug-first for landing flows).
drop function if exists public.get_my_join_request_by_slug(text);
create or replace function public.get_my_join_request_by_slug(p_community_slug text)
returns table(
  community_id uuid,
  status text,
  denied_until timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_slug text;
  v_community_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_slug := lower(btrim(coalesce(p_community_slug, '')));
  if v_slug = '' then
    raise exception 'community_slug is required' using errcode = '22023';
  end if;

  select c.id into v_community_id
  from public.communities c
  where c.slug = v_slug
  limit 1;

  if v_community_id is null then
    raise exception 'Community not found' using errcode = '22023';
  end if;

  return query
  select r.community_id, r.status, r.denied_until, r.updated_at
  from public.community_join_requests r
  where r.community_id = v_community_id
    and r.user_id = v_user_id
  limit 1;
end;
$$;

revoke all on function public.get_my_join_request_by_slug(text) from public;
revoke all on function public.get_my_join_request_by_slug(text) from anon;
revoke all on function public.get_my_join_request_by_slug(text) from authenticated;
revoke all on function public.get_my_join_request_by_slug(text) from service_role;
grant execute on function public.get_my_join_request_by_slug(text) to authenticated;
grant execute on function public.get_my_join_request_by_slug(text) to service_role;

-- Request access (free private only).
drop function if exists public.request_community_access_by_slug(text, text);
create or replace function public.request_community_access_by_slug(
  p_community_slug text,
  p_message text default null
)
returns table(
  community_id uuid,
  status text,
  denied_until timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_slug text;
  v_community public.communities%rowtype;
  v_now timestamptz := now();
  v_existing public.community_join_requests%rowtype;
  v_has_paid_plan boolean;
  v_message text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_slug := lower(btrim(coalesce(p_community_slug, '')));
  if v_slug = '' then
    raise exception 'community_slug is required' using errcode = '22023';
  end if;

  select * into v_community
  from public.communities c
  where c.slug = v_slug
  limit 1;

  if not found then
    raise exception 'Community not found' using errcode = '22023';
  end if;

  if v_community.visibility <> 'private' then
    raise exception 'request_access_only_supported_for_private' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.plans p
    where p.community_id = v_community.id
      and p.is_active = true
      and p.billing_period in ('monthly','yearly')
      and p.visibility in ('public','unlisted')
  ) into v_has_paid_plan;

  if v_has_paid_plan then
    raise exception 'paid_communities_do_not_use_request_access' using errcode = '22023';
  end if;

  if public.has_active_entitlement(v_community.id) then
    return query
    select v_community.id, 'approved'::text, null::timestamptz, v_now;
    return;
  end if;

  v_message := nullif(btrim(coalesce(p_message, '')), '');

  select * into v_existing
  from public.community_join_requests r
  where r.community_id = v_community.id
    and r.user_id = v_user_id
  for update;

  if found then
    if v_existing.status = 'pending' then
      return query
      select v_existing.community_id, v_existing.status, v_existing.denied_until, v_existing.updated_at;
      return;
    end if;

    if v_existing.status = 'approved' then
      return query
      select v_existing.community_id, v_existing.status, v_existing.denied_until, v_existing.updated_at;
      return;
    end if;

    if v_existing.status = 'denied' and v_existing.denied_until is not null and v_existing.denied_until > v_now then
      return query
      select v_existing.community_id, v_existing.status, v_existing.denied_until, v_existing.updated_at;
      return;
    end if;

    update public.community_join_requests
       set status = 'pending',
           message = v_message,
           decided_at = null,
           decided_by = null,
           denied_until = null,
           updated_at = v_now
     where id = v_existing.id
     returning * into v_existing;
  else
    insert into public.community_join_requests(
      community_id,
      user_id,
      status,
      message,
      created_at,
      updated_at
    ) values (
      v_community.id,
      v_user_id,
      'pending',
      v_message,
      v_now,
      v_now
    )
    returning * into v_existing;
  end if;

  return query
  select v_existing.community_id, v_existing.status, v_existing.denied_until, v_existing.updated_at;
end;
$$;

revoke all on function public.request_community_access_by_slug(text, text) from public;
revoke all on function public.request_community_access_by_slug(text, text) from anon;
revoke all on function public.request_community_access_by_slug(text, text) from authenticated;
revoke all on function public.request_community_access_by_slug(text, text) from service_role;
grant execute on function public.request_community_access_by_slug(text, text) to authenticated;
grant execute on function public.request_community_access_by_slug(text, text) to service_role;

-- Admin queue.
drop function if exists public.list_community_join_requests(uuid);
create or replace function public.list_community_join_requests(p_community_id uuid)
returns table(
  id uuid,
  community_id uuid,
  user_id uuid,
  status text,
  message text,
  created_at timestamptz,
  updated_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  denied_until timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  return query
  select
    r.id,
    r.community_id,
    r.user_id,
    r.status,
    r.message,
    r.created_at,
    r.updated_at,
    r.decided_at,
    r.decided_by,
    r.denied_until
  from public.community_join_requests r
  where r.community_id = p_community_id
    and r.status = 'pending'
  order by r.created_at asc;
end;
$$;

revoke all on function public.list_community_join_requests(uuid) from public;
grant execute on function public.list_community_join_requests(uuid) to authenticated;
grant execute on function public.list_community_join_requests(uuid) to service_role;

-- Approve/deny.
drop function if exists public.approve_community_join_request(uuid);
create or replace function public.approve_community_join_request(p_request_id uuid)
returns table(
  community_id uuid,
  user_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_now timestamptz := now();
  v_request public.community_join_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  select * into v_request
  from public.community_join_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(v_request.community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  update public.community_join_requests
     set status = 'approved',
         decided_at = v_now,
         decided_by = auth.uid(),
         denied_until = null,
         updated_at = v_now
   where id = v_request.id
   returning * into v_request;

  insert into public.community_memberships(community_id, user_id, role)
  values (v_request.community_id, v_request.user_id, 'member')
  on conflict (community_id, user_id) do nothing;

  insert into public.entitlements(
    user_id,
    community_id,
    source,
    source_ref,
    starts_at,
    ends_at
  ) values (
    v_request.user_id,
    v_request.community_id,
    'request_access',
    v_request.id::text,
    v_now,
    null
  )
  on conflict (user_id, community_id)
  do update set
    source = excluded.source,
    source_ref = excluded.source_ref,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    ends_at = null
  where entitlements.ends_at is not null
    and entitlements.ends_at <= v_now;

  return query
  select v_request.community_id, v_request.user_id, v_request.status;
end;
$$;

revoke all on function public.approve_community_join_request(uuid) from public;
grant execute on function public.approve_community_join_request(uuid) to authenticated;
grant execute on function public.approve_community_join_request(uuid) to service_role;

drop function if exists public.deny_community_join_request(uuid);
create or replace function public.deny_community_join_request(p_request_id uuid)
returns table(
  community_id uuid,
  user_id uuid,
  status text,
  denied_until timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_now timestamptz := now();
  v_request public.community_join_requests%rowtype;
  v_denied_until timestamptz := now() + interval '7 days';
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  select * into v_request
  from public.community_join_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(v_request.community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  update public.community_join_requests
     set status = 'denied',
         decided_at = v_now,
         decided_by = auth.uid(),
         denied_until = v_denied_until,
         updated_at = v_now
   where id = v_request.id
   returning * into v_request;

  return query
  select v_request.community_id, v_request.user_id, v_request.status, v_request.denied_until;
end;
$$;

revoke all on function public.deny_community_join_request(uuid) from public;
grant execute on function public.deny_community_join_request(uuid) to authenticated;
grant execute on function public.deny_community_join_request(uuid) to service_role;

