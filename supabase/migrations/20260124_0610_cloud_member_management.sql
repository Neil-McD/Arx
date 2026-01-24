-- Member management primitives.
-- Entitlements are canonical access control; memberships are a roster projection.

-- Helper: check entitlement for an arbitrary user (used to keep the roster accurate).
create or replace function public.user_has_active_entitlement(p_user_id uuid, p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.community_id = p_community_id
      and e.user_id = p_user_id
      and e.status = 'active'
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
  );
$$;

-- Roster should only show members who currently have access.
drop policy if exists memberships_select_entitled on public.community_memberships;
create policy memberships_select_entitled
on public.community_memberships
for select
to authenticated
using (
  public.has_active_entitlement(community_id)
  and public.user_has_active_entitlement(user_id, community_id)
);

create or replace function public.set_member_role(
  p_community_id uuid,
  p_user_id uuid,
  p_role text,
  p_tier_id text default null
)
returns table (
  community_id uuid,
  user_id uuid,
  role text,
  tier_id text,
  ends_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor_id uuid;
  v_is_owner boolean;
  v_is_admin boolean;
  v_owner_id uuid;
  v_role text;
  v_now timestamptz := now();
  v_existing_entitlement_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null or p_user_id is null then
    raise exception 'community_id and user_id are required' using errcode = '22023';
  end if;

  select c.owner_id into v_owner_id
  from public.communities c
  where c.id = p_community_id;

  if v_owner_id is null then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  v_is_owner := (v_owner_id = v_actor_id) or public.is_community_owner(p_community_id);
  v_is_admin := public.has_active_entitlement_role(p_community_id, array['admin']);

  if not (v_is_owner or v_is_admin) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  v_role := lower(btrim(coalesce(p_role, '')));
  if v_role not in ('member', 'mod', 'admin') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  -- Never mutate the community owner (ownership transfers are out of MVP scope).
  if p_user_id = v_owner_id then
    raise exception 'cannot_change_owner' using errcode = '22023';
  end if;

  -- Admins cannot grant admin or modify other admins.
  if (not v_is_owner) then
    if v_role = 'admin' then
      raise exception 'forbidden' using errcode = '28000';
    end if;
    if public.has_active_entitlement_role(p_community_id, array['admin']) and p_user_id <> v_actor_id then
      -- If the target is an admin, disallow (owner-only). We detect via entitlements directly.
      if exists (
        select 1
        from public.entitlements e
        where e.community_id = p_community_id
          and e.user_id = p_user_id
          and e.status = 'active'
          and e.role = 'admin'
          and e.starts_at <= v_now
          and (e.ends_at is null or e.ends_at > v_now)
      ) then
        raise exception 'forbidden' using errcode = '28000';
      end if;
    end if;
  end if;

  -- Membership roster projection.
  insert into public.community_memberships(community_id, user_id, role)
  values (p_community_id, p_user_id, v_role)
  on conflict (community_id, user_id) do update
    set role = excluded.role;

  -- Canonical entitlement.
  select id into v_existing_entitlement_id
  from public.entitlements
  where user_id = p_user_id
    and community_id = p_community_id
    and status = 'active'
  limit 1;

  if v_existing_entitlement_id is null then
    insert into public.entitlements(
      user_id,
      community_id,
      role,
      tier_id,
      source,
      source_ref,
      status,
      starts_at,
      ends_at
    ) values (
      p_user_id,
      p_community_id,
      v_role,
      coalesce(nullif(btrim(coalesce(p_tier_id, '')), ''), 'member'),
      'manual_grant',
      'set_member_role:' || v_actor_id::text,
      'active',
      v_now,
      null
    );
  else
    update public.entitlements
      set role = v_role,
          tier_id = coalesce(nullif(btrim(coalesce(p_tier_id, '')), ''), tier_id),
          source = 'manual_grant',
          source_ref = 'set_member_role:' || v_actor_id::text,
          starts_at = least(starts_at, v_now),
          ends_at = null
    where id = v_existing_entitlement_id;
  end if;

  return query
  select
    p_community_id,
    p_user_id,
    v_role,
    coalesce(nullif(btrim(coalesce(p_tier_id, '')), ''), 'member'),
    null::timestamptz;
end;
$$;

create or replace function public.remove_member(
  p_community_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor_id uuid;
  v_is_owner boolean;
  v_is_admin boolean;
  v_owner_id uuid;
  v_now timestamptz := now();
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null or p_user_id is null then
    raise exception 'community_id and user_id are required' using errcode = '22023';
  end if;

  select c.owner_id into v_owner_id
  from public.communities c
  where c.id = p_community_id;

  if v_owner_id is null then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  if p_user_id = v_owner_id then
    raise exception 'cannot_remove_owner' using errcode = '22023';
  end if;

  v_is_owner := (v_owner_id = v_actor_id) or public.is_community_owner(p_community_id);
  v_is_admin := public.has_active_entitlement_role(p_community_id, array['admin']);

  if not (v_is_owner or v_is_admin) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  -- Admins cannot remove admins.
  if not v_is_owner then
    if exists (
      select 1
      from public.entitlements e
      where e.community_id = p_community_id
        and e.user_id = p_user_id
        and e.status = 'active'
        and e.role = 'admin'
        and e.starts_at <= v_now
        and (e.ends_at is null or e.ends_at > v_now)
    ) then
      raise exception 'forbidden' using errcode = '28000';
    end if;
  end if;

  -- Revoke canonical access (non-destructive; allows rejoin if public/invited).
  update public.entitlements
    set ends_at = v_now,
        source = 'manual_revoke',
        source_ref = 'remove_member:' || v_actor_id::text
  where user_id = p_user_id
    and community_id = p_community_id
    and status = 'active';

  -- Remove from roster projection.
  delete from public.community_memberships
  where community_id = p_community_id
    and user_id = p_user_id;
end;
$$;

