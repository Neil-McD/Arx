-- Community bootstrap invariants.
-- Guarantee that a community has:
-- - an owner membership row (projection)
-- - an owner entitlement row (canonical access)
-- - a community chat thread (threads.id == community_id)

create or replace function public.ensure_community_bootstrap(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_owner_id uuid;
  v_existing_thread public.threads%rowtype;
begin
  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  select c.owner_id
    into v_owner_id
    from public.communities c
   where c.id = p_community_id;

  if v_owner_id is null then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  -- Owner membership (projection).
  insert into public.community_memberships(community_id, user_id, role)
  values (p_community_id, v_owner_id, 'owner')
  on conflict (community_id, user_id) do update
    set role = 'owner';

  -- Owner entitlement (canonical access).
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
    v_owner_id,
    p_community_id,
    'owner',
    'founder',
    'manual_grant',
    'community_bootstrap',
    'active',
    now(),
    null
  )
  on conflict (user_id, community_id) where status = 'active'
  do update set
    role = excluded.role,
    tier_id = excluded.tier_id,
    source = excluded.source,
    source_ref = excluded.source_ref,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    ends_at = null;

  -- Community chat thread (threads.id == community_id).
  select * into v_existing_thread
  from public.threads t
  where t.id = p_community_id
  limit 1;

  if found then
    if v_existing_thread.engine_id <> 'community_chat'
      or v_existing_thread.community_id is distinct from p_community_id
    then
      raise exception 'community_chat_thread_collision' using errcode = '23514';
    end if;
  else
    insert into public.threads(
      id,
      owner_id,
      title,
      engine_id,
      model_id,
      community_id
    ) values (
      p_community_id,
      v_owner_id,
      'Community chat',
      'community_chat',
      null,
      p_community_id
    )
    on conflict (id) do nothing;
  end if;
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
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
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

-- Enforce: community creation happens via the RPC so bootstrap invariants are always applied.
drop policy if exists communities_insert_owner on public.communities;

-- Backfill bootstrap invariants for existing communities (safe/idempotent).
do $$
declare
  r record;
begin
  for r in select id from public.communities loop
    perform public.ensure_community_bootstrap(r.id);
  end loop;
end;
$$;

