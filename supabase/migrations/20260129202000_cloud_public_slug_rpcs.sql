-- Slug-based wrappers for common public flows.
-- Goal: keep public surfaces slug-first (no UUIDs required in unauth/landing flows),
-- while still enforcing auth/entitlements inside canonical RPCs.

drop function if exists public.get_my_community_access_by_slug(text);
create or replace function public.get_my_community_access_by_slug(p_community_slug text)
returns table (
  community_id uuid,
  user_id uuid,
  is_owner boolean,
  is_entitled boolean,
  entitlement_role text,
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
  v_slug text;
  v_community_id uuid;
begin
  if auth.uid() is null then
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
  select * from public.get_my_community_access(v_community_id);
end;
$$;

revoke all on function public.get_my_community_access_by_slug(text) from public;
revoke all on function public.get_my_community_access_by_slug(text) from anon;
revoke all on function public.get_my_community_access_by_slug(text) from authenticated;
revoke all on function public.get_my_community_access_by_slug(text) from service_role;
grant execute on function public.get_my_community_access_by_slug(text) to authenticated;
grant execute on function public.get_my_community_access_by_slug(text) to service_role;

drop function if exists public.join_public_community_by_slug(text, uuid);
create or replace function public.join_public_community_by_slug(
  p_community_slug text,
  p_brandos_aid uuid default null
)
returns table(community_id uuid, community_slug text, community_name text)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_slug text;
  v_community_id uuid;
begin
  if auth.uid() is null then
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
  select * from public.join_public_community(v_community_id, p_brandos_aid);
end;
$$;

revoke all on function public.join_public_community_by_slug(text, uuid) from public;
revoke all on function public.join_public_community_by_slug(text, uuid) from anon;
revoke all on function public.join_public_community_by_slug(text, uuid) from authenticated;
revoke all on function public.join_public_community_by_slug(text, uuid) from service_role;
grant execute on function public.join_public_community_by_slug(text, uuid) to authenticated;
grant execute on function public.join_public_community_by_slug(text, uuid) to service_role;

