-- Effective access API.
-- A single place for clients to ask "what can I do in this community?"
-- Security is still enforced by RLS; this is for UX + consistency.

create or replace function public.get_my_community_access(p_community_id uuid)
returns table (
  community_id uuid,
  user_id uuid,
  is_owner boolean,
  is_entitled boolean,
  entitlement_role text,
  entitlement_tier_id text,
  entitlement_ends_at timestamptz,
  effective_role text,
  can_view boolean,
  can_post_message boolean,
  can_create_resource boolean,
  can_manage_resources boolean,
  can_invite boolean,
  can_manage_members boolean
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_is_owner boolean;
  v_is_entitled boolean;
  v_ent public.entitlements%rowtype;
  v_effective_role text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.communities c
    where c.id = p_community_id
  ) then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  v_is_owner := exists (
    select 1
    from public.communities c
    where c.id = p_community_id
      and c.owner_id = v_user_id
  );

  v_is_entitled := public.has_active_entitlement(p_community_id);

  -- "Active" row may exist even if expired; entitlement time validity is represented by v_is_entitled.
  select *
    into v_ent
    from public.entitlements e
   where e.user_id = v_user_id
     and e.community_id = p_community_id
     and e.status = 'active'
   order by e.starts_at desc
   limit 1;

  v_effective_role := null;
  if v_is_owner then
    v_effective_role := 'owner';
  elsif v_is_entitled then
    v_effective_role := coalesce(v_ent.role, 'member');
  end if;

  return query
  select
    p_community_id,
    v_user_id,
    v_is_owner,
    v_is_entitled,
    v_ent.role,
    v_ent.tier_id,
    v_ent.ends_at,
    v_effective_role,
    v_is_entitled,
    v_is_entitled,
    (
      v_is_owner
      or public.has_active_entitlement_role(p_community_id, array['owner','admin','mod'])
    ),
    (
      v_is_owner
      or public.has_active_entitlement_role(p_community_id, array['owner','admin','mod'])
    ),
    v_is_owner,
    v_is_owner;
end;
$$;

