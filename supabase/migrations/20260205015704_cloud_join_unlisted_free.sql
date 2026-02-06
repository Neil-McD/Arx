-- Allow free joins for unlisted communities via the canonical landing link.
--
-- Semantics:
-- - public: discoverable + free join allowed when no paid plan.
-- - unlisted: not discoverable, but free join allowed via /c/<slug>.
-- - private: free join requires request access (handled separately).

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
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.communities c
    where c.id = p_community_id
      and c.visibility in ('public','unlisted')
  ) then
    raise exception 'Community is not open for free joins' using errcode = '22023';
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

