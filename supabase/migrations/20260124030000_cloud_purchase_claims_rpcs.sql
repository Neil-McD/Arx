-- Purchase claim helpers (pay-first join).
-- These functions are used by Edge Functions and the client claim redemption flow.

-- Required for extensions.digest(...).
create extension if not exists pgcrypto with schema extensions;

create or replace function public.hash_purchase_claim_token(token text)
returns bytea
language sql
immutable
as $$
  select extensions.digest(token, 'sha256');
$$;

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

  -- Upsert an active entitlement
  select id into v_existing_entitlement_id
  from public.entitlements
  where user_id = v_user_id
    and community_id = v_intent.community_id
    and status = 'active'
  limit 1;

  if v_existing_entitlement_id is null then
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
      v_user_id,
      v_intent.community_id,
      coalesce(v_plan.role, 'member'),
      coalesce(v_plan.tier_id, 'member'),
      'stripe',
      coalesce(v_receipt.provider_subscription_id, v_receipt.provider_session_id),
      'active',
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
