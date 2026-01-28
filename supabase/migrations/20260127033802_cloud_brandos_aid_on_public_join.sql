-- Propagate BrandOS attribution through public joins.
-- (Renamed to match the applied Supabase migration version.)
--
-- Goal: free/public joins should be able to fire identity.email_captured with brandos_aid
-- so the BrandOS connector can identify users even when there is no pay-first checkout.

-- 1) Join flow: accept optional brandos_aid and pass it to triggers via a transaction-local setting.
drop function if exists public.join_public_community(uuid);
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
      and c.visibility = 'public'
  ) then
    raise exception 'Community is not public' using errcode = '22023';
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

-- 2) Member-join automations: include brandos_aid (when available) in identity.email_captured.
create or replace function public.enqueue_automation_member_joined()
returns trigger
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  v_email text;
  v_brandos_aid text;
begin
  insert into public.automation_events(
    community_id,
    event_type,
    payload,
    occurred_at,
    status,
    next_attempt_at,
    idempotency_key
  ) values (
    new.community_id,
    'community.member_joined',
    jsonb_build_object(
      'membership_id', new.id,
      'user_id', new.user_id,
      'role', new.role
    ),
    new.created_at,
    'pending',
    now(),
    format('community.member_joined:%s', new.id::text)
  )
  on conflict (idempotency_key) do nothing;

  v_brandos_aid := nullif(current_setting('arx.brandos_aid', true), '');
  if v_brandos_aid is not null and v_brandos_aid !~ '^[0-9a-fA-F-]{36}$' then
    v_brandos_aid := null;
  end if;

  select lower(btrim(coalesce(u.email, ''))) into v_email
    from auth.users u
   where u.id = new.user_id;

  if v_email is not null and v_email <> '' then
    insert into public.automation_events(
      community_id,
      event_type,
      payload,
      occurred_at,
      status,
      next_attempt_at,
      idempotency_key
    ) values (
      new.community_id,
      'identity.email_captured',
      jsonb_build_object(
        'email', v_email,
        'user_id', new.user_id,
        'membership_id', new.id,
        'source', 'membership',
        'brandos_aid', v_brandos_aid
      ),
      new.created_at,
      'pending',
      now(),
      format('identity.email_captured:%s:%s:%s', new.community_id::text, v_email, coalesce(v_brandos_aid, ''))
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return new;
end;
$$;
