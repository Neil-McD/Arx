-- Admin member list with access status (declined vs active).
--
-- Rationale:
-- - Memberships are a roster projection and can outlive access.
-- - Public/member roster queries are gated to currently-entitled users.
-- - Admins need to see lapsed members as "(declined)" without exposing payment internals.

create or replace function public.list_community_members_admin(p_community_id uuid)
returns table (
  id uuid,
  community_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  is_entitled boolean,
  entitlement_ends_at timestamptz,
  access_status text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin','mod']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  return query
  select
    m.id,
    m.community_id,
    m.user_id,
    m.role,
    m.created_at,
    public.user_has_active_entitlement(m.user_id, m.community_id) as is_entitled,
    e.ends_at as entitlement_ends_at,
    case
      when public.user_has_active_entitlement(m.user_id, m.community_id) then 'active'
      else 'declined'
    end as access_status
  from public.community_memberships m
  left join public.entitlements e
    on e.user_id = m.user_id
   and e.community_id = m.community_id
  where m.community_id = p_community_id
  order by m.created_at asc;
end;
$$;

revoke all on function public.list_community_members_admin(uuid) from public;
grant execute on function public.list_community_members_admin(uuid) to authenticated;
grant execute on function public.list_community_members_admin(uuid) to service_role;
