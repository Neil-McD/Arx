-- Member management v2: return the canonical entitlement fields.

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
  v_owner_id uuid;
  v_is_owner boolean;
  v_is_admin boolean;
  v_target_is_admin boolean;
  v_role text;
  v_now timestamptz := now();
  v_ent public.entitlements%rowtype;
  v_tier_input text;
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

  v_is_owner := (v_owner_id = v_actor_id);
  v_is_admin := public.has_active_entitlement_role(p_community_id, array['admin']);

  if not (v_is_owner or v_is_admin) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  -- Never mutate the community owner (ownership transfers are out of MVP scope).
  if p_user_id = v_owner_id then
    raise exception 'cannot_change_owner' using errcode = '22023';
  end if;

  v_role := lower(btrim(coalesce(p_role, '')));
  if v_role not in ('member', 'mod', 'admin') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  -- Admin restrictions: cannot grant admin or modify existing admins.
  v_target_is_admin := exists (
    select 1
    from public.entitlements e
    where e.community_id = p_community_id
      and e.user_id = p_user_id
      and e.status = 'active'
      and e.role = 'admin'
      and e.starts_at <= v_now
      and (e.ends_at is null or e.ends_at > v_now)
  );

  if (not v_is_owner) then
    if v_role = 'admin' then
      raise exception 'forbidden' using errcode = '28000';
    end if;
    if v_target_is_admin then
      raise exception 'forbidden' using errcode = '28000';
    end if;
  end if;

  -- Membership roster projection.
  insert into public.community_memberships(community_id, user_id, role)
  values (p_community_id, p_user_id, v_role)
  on conflict (community_id, user_id) do update
    set role = excluded.role;

  v_tier_input := nullif(btrim(coalesce(p_tier_id, '')), '');

  -- Canonical entitlement (insert/update in one statement).
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
    coalesce(v_tier_input, 'member'),
    'manual_grant',
    'set_member_role:' || v_actor_id::text,
    'active',
    v_now,
    null
  )
  on conflict (user_id, community_id) where status = 'active'
  do update set
    role = excluded.role,
    tier_id = coalesce(v_tier_input, entitlements.tier_id),
    source = excluded.source,
    source_ref = excluded.source_ref,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    ends_at = null
  returning * into v_ent;

  return query
  select
    p_community_id,
    p_user_id,
    v_ent.role,
    v_ent.tier_id,
    v_ent.ends_at;
end;
$$;

