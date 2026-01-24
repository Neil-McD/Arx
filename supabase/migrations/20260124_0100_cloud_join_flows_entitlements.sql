-- Ensure join flows mint entitlements (canonical access control).
--
-- join_public_community + accept_community_invite previously only created memberships.
-- With RLS gated on entitlements, joins must also grant an active entitlement.

create or replace function public.join_public_community(p_community_id uuid)
returns table(community_id uuid, community_slug text, community_name text, role text, tier_id text)
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
      and c.visibility = 'public'
  ) then
    raise exception 'Community is not public' using errcode = '22023';
  end if;

  insert into public.community_memberships(community_id, user_id, role)
  values (p_community_id, auth.uid(), 'member')
  on conflict (community_id, user_id) do nothing;

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
    auth.uid(),
    p_community_id,
    'member',
    'member',
    'public_join',
    p_community_id::text,
    'active',
    v_now,
    null
  )
  on conflict (user_id, community_id) where status = 'active'
  do update set
    role = excluded.role,
    tier_id = excluded.tier_id,
    source = excluded.source,
    source_ref = excluded.source_ref,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    ends_at = null
  where entitlements.ends_at is not null
    and entitlements.ends_at <= v_now;

  return query
  select c.id, c.slug, c.name, 'member'::text, 'member'::text
    from public.communities c
   where c.id = p_community_id;
end;
$$;

create or replace function public.accept_community_invite(invite_code text)
returns table(community_id uuid, community_slug text, community_name text, role text, tier_id text)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_invite public.community_invites%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if invite_code is null or btrim(invite_code) = '' then
    raise exception 'Invite code is required' using errcode = '22023';
  end if;

  select *
    into v_invite
    from public.community_invites
   where code = btrim(invite_code)
   limit 1;

  if not found then
    raise exception 'Invalid invite code' using errcode = '22023';
  end if;

  -- Insert invite use first so max_uses/expires/revoked are enforced.
  insert into public.community_invite_uses(invite_id, user_id)
  values (v_invite.id, auth.uid())
  on conflict (invite_id, user_id) do nothing;

  -- Create membership if missing.
  insert into public.community_memberships(community_id, user_id, role)
  values (v_invite.community_id, auth.uid(), v_invite.role)
  on conflict (community_id, user_id) do nothing;

  -- Grant entitlement if missing/expired.
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
    auth.uid(),
    v_invite.community_id,
    v_invite.role,
    coalesce(v_invite.tier_id, 'member'),
    'invite',
    v_invite.code,
    'active',
    v_now,
    null
  )
  on conflict (user_id, community_id) where status = 'active'
  do update set
    role = excluded.role,
    tier_id = excluded.tier_id,
    source = excluded.source,
    source_ref = excluded.source_ref,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    ends_at = null
  where entitlements.ends_at is not null
    and entitlements.ends_at <= v_now;

  return query
  select c.id, c.slug, c.name, v_invite.role, v_invite.tier_id
    from public.communities c
   where c.id = v_invite.community_id;
end;
$$;

