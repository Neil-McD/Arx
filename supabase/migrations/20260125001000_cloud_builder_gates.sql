-- Enforce builder tiers for community creation + monetization.
--
-- Requirement: only paying builders can create communities.
-- Builder ($20/mo) => max 1 community. Pro ($100/mo) => max 3 communities.

create or replace function public.max_communities_for_builder_tier(p_tier text)
returns integer
language sql
stable
as $$
  select case
    when lower(coalesce(p_tier, '')) = 'pro' then 3
    when lower(coalesce(p_tier, '')) = 'builder' then 1
    else 0
  end;
$$;

create or replace function public.create_community(
  p_name text,
  p_slug text,
  p_visibility text default 'private',
  p_description text default null,
  p_avatar_url text default null,
  p_banner_url text default null
)
returns setof public.communities
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_community public.communities%rowtype;
  v_slug text;
  v_name text;
  v_visibility text;
  v_description text;
  v_avatar_url text;
  v_banner_url text;
  v_builder_tier text;
  v_max integer;
  v_existing_count integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.builder_tier
    into v_builder_tier
    from public.profiles p
   where p.user_id = v_user_id;

  v_max := public.max_communities_for_builder_tier(coalesce(v_builder_tier, 'free'));
  if v_max <= 0 then
    raise exception 'Builder plan required to create communities' using errcode = '42501';
  end if;

  select count(1)
    into v_existing_count
    from public.communities c
   where c.owner_id = v_user_id;

  if v_existing_count >= v_max then
    raise exception 'Community limit reached for your plan' using errcode = '22023';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'name is required' using errcode = '22023';
  end if;

  v_slug := lower(btrim(coalesce(p_slug, '')));
  if v_slug = '' then
    raise exception 'slug is required' using errcode = '22023';
  end if;

  if length(v_slug) < 3 or length(v_slug) > 32 or v_slug !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;

  v_visibility := coalesce(btrim(p_visibility), 'private');
  if v_visibility not in ('public', 'unlisted', 'private') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;

  v_description := nullif(btrim(coalesce(p_description, '')), '');
  v_avatar_url := nullif(btrim(coalesce(p_avatar_url, '')), '');
  v_banner_url := nullif(btrim(coalesce(p_banner_url, '')), '');

  insert into public.communities(
    slug,
    name,
    owner_id,
    visibility,
    description,
    avatar_url,
    banner_url
  ) values (
    v_slug,
    v_name,
    v_user_id,
    v_visibility,
    v_description,
    v_avatar_url,
    v_banner_url
  )
  returning * into v_community;

  perform public.ensure_community_bootstrap(v_community.id);

  return query
  select *
    from public.communities c
   where c.id = v_community.id;
end;
$$;

