-- Analytics helper: count currently entitled members for a community.
--
-- Membership rows can be historical/roster; entitlements are canonical access.

create or replace function public.community_entitled_member_count(p_community_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_count bigint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)
    into v_count
    from public.entitlements e
   where e.community_id = p_community_id
     and e.starts_at <= now()
     and (e.ends_at is null or e.ends_at > now());

  return coalesce(v_count, 0);
end;
$$;

