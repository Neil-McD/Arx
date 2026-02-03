-- Simplify entitlements: remove redundant status.
--
-- MVP contract: entitlements are canonical access, represented as a single row per
-- (user_id, community_id) with time-bounds in starts_at / ends_at.

-- Drop status-only invariants and replace the partial unique index with a plain one.
alter table public.entitlements drop constraint if exists entitlements_status_check;
drop index if exists public.uq_entitlements_one_active_per_user_community;

alter table public.entitlements drop column if exists status;

create unique index if not exists uq_entitlements_one_per_user_community
  on public.entitlements(user_id, community_id);

-- Helper functions (entitlements are canonical access control).
create or replace function public.has_active_entitlement(p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.community_id = p_community_id
      and e.user_id = auth.uid()
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
  );
$$;

create or replace function public.has_active_entitlement_role(p_community_id uuid, p_roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.community_id = p_community_id
      and e.user_id = auth.uid()
      and e.role = any (p_roles)
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
  );
$$;

create or replace function public.user_has_active_entitlement(p_user_id uuid, p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.community_id = p_community_id
      and e.user_id = p_user_id
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
  );
$$;

-- Join flows must mint entitlements (canonical access control).
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
    starts_at,
    ends_at
  ) values (
    auth.uid(),
    p_community_id,
    'member',
    'member',
    'public_join',
    p_community_id::text,
    v_now,
    null
  )
  on conflict (user_id, community_id)
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
    starts_at,
    ends_at
  ) values (
    auth.uid(),
    v_invite.community_id,
    v_invite.role,
    coalesce(v_invite.tier_id, 'member'),
    'invite',
    v_invite.code,
    v_now,
    null
  )
  on conflict (user_id, community_id)
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

-- Community bootstrap invariants: owner membership + entitlement.
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
    starts_at,
    ends_at
  ) values (
    v_owner_id,
    p_community_id,
    'owner',
    'founder',
    'manual_grant',
    'community_bootstrap',
    now(),
    null
  )
  on conflict (user_id, community_id)
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

-- Member management (v2): return the canonical entitlement fields.
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
    starts_at,
    ends_at
  ) values (
    p_user_id,
    p_community_id,
    v_role,
    coalesce(v_tier_input, 'member'),
    'manual_grant',
    'set_member_role:' || v_actor_id::text,
    v_now,
    null
  )
  on conflict (user_id, community_id)
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

create or replace function public.remove_member(
  p_community_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor_id uuid;
  v_is_owner boolean;
  v_is_admin boolean;
  v_owner_id uuid;
  v_now timestamptz := now();
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

  if p_user_id = v_owner_id then
    raise exception 'cannot_remove_owner' using errcode = '22023';
  end if;

  v_is_owner := (v_owner_id = v_actor_id) or public.is_community_owner(p_community_id);
  v_is_admin := public.has_active_entitlement_role(p_community_id, array['admin']);

  if not (v_is_owner or v_is_admin) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  -- Admins cannot remove admins.
  if not v_is_owner then
    if exists (
      select 1
      from public.entitlements e
      where e.community_id = p_community_id
        and e.user_id = p_user_id
        and e.role = 'admin'
        and e.starts_at <= v_now
        and (e.ends_at is null or e.ends_at > v_now)
    ) then
      raise exception 'forbidden' using errcode = '28000';
    end if;
  end if;

  -- Revoke canonical access (non-destructive; allows rejoin if public/invited).
  update public.entitlements
    set ends_at = v_now,
        source = 'manual_revoke',
        source_ref = 'remove_member:' || v_actor_id::text
  where user_id = p_user_id
    and community_id = p_community_id;

  -- Remove from roster projection.
  delete from public.community_memberships
  where community_id = p_community_id
    and user_id = p_user_id;
end;
$$;

-- Effective access API (v2): align capabilities with DB member-management rules.
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
  v_is_admin boolean;
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
  v_is_admin := public.has_active_entitlement_role(p_community_id, array['admin']);

  -- Row may exist even if expired; time validity is represented by v_is_entitled.
  select *
    into v_ent
    from public.entitlements e
   where e.user_id = v_user_id
     and e.community_id = p_community_id
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
    (v_is_owner or v_is_admin);
end;
$$;

-- Pay-first join: claim redemption must upsert entitlements (canonical access).
create or replace function public.redeem_purchase_claim(p_token text)
returns table(
  community_id uuid,
  community_slug text,
  community_name text,
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
  v_user_id uuid;
  v_hash bytea;
  v_claim public.purchase_claims%rowtype;
  v_intent public.payment_intents%rowtype;
  v_plan public.plans%rowtype;
  v_receipt public.payment_receipts%rowtype;
  v_sub public.provider_subscriptions%rowtype;
  v_now timestamptz := now();
  v_effective_ends_at timestamptz;
  v_existing_entitlement_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception 'token is required' using errcode = '22023';
  end if;

  v_hash := public.hash_purchase_claim_token(btrim(p_token));

  select * into v_claim
  from public.purchase_claims
  where token_hash = v_hash
  for update;

  if not found then
    raise exception 'invalid_or_expired' using errcode = '22023';
  end if;

  if v_claim.status <> 'issued' then
    raise exception 'invalid_or_expired' using errcode = '22023';
  end if;

  if v_claim.expires_at <= v_now then
    update public.purchase_claims
      set status = 'expired'
    where id = v_claim.id;
    raise exception 'invalid_or_expired' using errcode = '22023';
  end if;

  select * into v_intent
  from public.payment_intents
  where id = v_claim.payment_intent_id
  for update;

  if not found then
    raise exception 'invalid_or_expired' using errcode = '22023';
  end if;

  if v_intent.status <> 'succeeded' then
    raise exception 'payment_not_confirmed' using errcode = '22023';
  end if;

  -- If already bound, enforce same user.
  if v_intent.user_id is not null and v_intent.user_id <> v_user_id then
    raise exception 'invalid_or_expired' using errcode = '22023';
  end if;

  select * into v_plan
  from public.plans
  where id = v_intent.plan_id;

  -- Latest receipt for this intent
  select * into v_receipt
  from public.payment_receipts
  where payment_intent_id = v_intent.id
  order by created_at desc
  limit 1;

  v_effective_ends_at := null;

  if v_receipt.provider_subscription_id is not null then
    select * into v_sub
    from public.provider_subscriptions
    where provider = v_receipt.provider
      and provider_subscription_id = v_receipt.provider_subscription_id
    for update;

    if found then
      v_effective_ends_at := v_sub.current_period_end;
      if v_sub.user_id is null then
        update public.provider_subscriptions
          set user_id = v_user_id,
              updated_at = v_now
        where id = v_sub.id;
      end if;
    end if;
  end if;

  if v_intent.user_id is null then
    update public.payment_intents
      set user_id = v_user_id,
          updated_at = v_now
    where id = v_intent.id;
  end if;

  -- Create membership (projection used by most app reads)
  insert into public.community_memberships(community_id, user_id, role)
  values (v_intent.community_id, v_user_id, coalesce(v_plan.role, 'member'))
  on conflict (community_id, user_id) do nothing;

  -- Upsert entitlement
  select id into v_existing_entitlement_id
  from public.entitlements
  where user_id = v_user_id
    and community_id = v_intent.community_id
  limit 1;

  if v_existing_entitlement_id is null then
    insert into public.entitlements(
      user_id,
      community_id,
      role,
      tier_id,
      source,
      source_ref,
      starts_at,
      ends_at
    ) values (
      v_user_id,
      v_intent.community_id,
      coalesce(v_plan.role, 'member'),
      coalesce(v_plan.tier_id, 'member'),
      'stripe',
      coalesce(v_receipt.provider_subscription_id, v_receipt.provider_session_id),
      v_now,
      v_effective_ends_at
    );
  else
    update public.entitlements
      set role = coalesce(v_plan.role, role),
          tier_id = coalesce(v_plan.tier_id, tier_id),
          source = 'stripe',
          source_ref = coalesce(v_receipt.provider_subscription_id, v_receipt.provider_session_id),
          ends_at = v_effective_ends_at,
          starts_at = least(starts_at, v_now)
    where id = v_existing_entitlement_id;
  end if;

  update public.purchase_claims
    set status = 'redeemed',
        redeemed_by_user_id = v_user_id,
        redeemed_at = v_now
  where id = v_claim.id;

  return query
  select c.id, c.slug, c.name,
         coalesce(v_plan.role, 'member')::text,
         coalesce(v_plan.tier_id, 'member')::text,
         v_effective_ends_at
  from public.communities c
  where c.id = v_intent.community_id;
end;
$$;
