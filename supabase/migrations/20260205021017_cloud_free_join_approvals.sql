-- Free join approvals for public/unlisted communities.
--
-- Goal:
-- - Allow builders/admins to require manual approval for free joins even when a community is public.
-- - Preserve the simple Skool-like semantics:
--   - The canonical community URL (/c/<slug>) is the entry point.
--   - Paid communities require checkout (no join requests).
--   - Free communities can be either instant-join (auto-approve) or manual approvals.
-- - Private communities remain request-based for free join (always approval-gated).

alter table public.communities
  add column if not exists free_join_requires_approval boolean not null default false;

drop function if exists public.set_community_free_join_requires_approval(uuid, boolean);
create or replace function public.set_community_free_join_requires_approval(
  p_community_id uuid,
  p_requires_approval boolean
)
returns table(
  community_id uuid,
  free_join_requires_approval boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_requires boolean := coalesce(p_requires_approval, false);
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  update public.communities
     set free_join_requires_approval = v_requires,
         updated_at = v_now
   where id = p_community_id;

  if not found then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  return query
  select c.id, c.free_join_requires_approval, c.updated_at
  from public.communities c
  where c.id = p_community_id;
end;
$$;

revoke all on function public.set_community_free_join_requires_approval(uuid, boolean) from public;
revoke all on function public.set_community_free_join_requires_approval(uuid, boolean) from anon;
revoke all on function public.set_community_free_join_requires_approval(uuid, boolean) from authenticated;
grant execute on function public.set_community_free_join_requires_approval(uuid, boolean) to authenticated;
grant execute on function public.set_community_free_join_requires_approval(uuid, boolean) to service_role;

-- Enforce: free join is only allowed when there are no paid plans and approvals aren't required.
create or replace function public.join_public_community(
  p_community_id uuid,
  p_brandos_aid uuid default null
)
returns table(community_id uuid, community_slug text, community_name text)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_now timestamptz := now();
  v_requires_approval boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  select coalesce(c.free_join_requires_approval, false) into v_requires_approval
  from public.communities c
  where c.id = p_community_id
    and c.visibility in ('public','unlisted')
  limit 1;

  if not found then
    raise exception 'Community is not open for free joins' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.plans p
    where p.community_id = p_community_id
      and p.is_active = true
      and p.billing_period in ('monthly','yearly')
      and p.visibility in ('public','unlisted')
  ) then
    raise exception 'paid_plan_required' using errcode = '22023';
  end if;

  if v_requires_approval then
    raise exception 'approval_required' using errcode = '22023';
  end if;

  if p_brandos_aid is not null then
    perform set_config('arx.brandos_aid', p_brandos_aid::text, true);
  end if;

  insert into public.community_memberships(community_id, user_id, role)
  values (p_community_id, auth.uid(), 'member')
  on conflict (community_id, user_id) do nothing;

  insert into public.entitlements(
    user_id,
    community_id,
    source,
    source_ref,
    starts_at,
    ends_at
  ) values (
    auth.uid(),
    p_community_id,
    'public_join',
    p_community_id::text,
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
  select c.id, c.slug, c.name
    from public.communities c
   where c.id = p_community_id;
end;
$$;

revoke all on function public.join_public_community(uuid, uuid) from public;
revoke all on function public.join_public_community(uuid, uuid) from anon;
revoke all on function public.join_public_community(uuid, uuid) from authenticated;
grant execute on function public.join_public_community(uuid, uuid) to authenticated;
grant execute on function public.join_public_community(uuid, uuid) to service_role;

-- Extend request access to support public/unlisted communities when approvals are enabled.
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

  if v_community.visibility = 'private' then
    -- Always request-based when private+free.
    null;
  elsif v_community.visibility in ('public','unlisted') then
    if not coalesce(v_community.free_join_requires_approval, false) then
      raise exception 'request_access_not_required' using errcode = '22023';
    end if;
  else
    raise exception 'request_access_not_supported' using errcode = '22023';
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
grant execute on function public.request_community_access_by_slug(text, text) to authenticated;
grant execute on function public.request_community_access_by_slug(text, text) to service_role;
