-- Propagate BrandOS attribution through claim redemption.
-- (Renamed to match the applied Supabase migration version.)
--
-- Goal: pay-first flows that mint membership via redeem_purchase_claim should also
-- carry `brandos_aid` into the membership-triggered identity.email_captured event.
-- This improves coverage for "finish signup elsewhere" and keeps attribution deterministic.

create or replace function public.redeem_purchase_claim(p_token text)
returns table(
  community_id uuid,
  community_slug text,
  community_name text,
  ends_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_user_id uuid;
  v_hash bytea;
  v_claim public.purchase_claims%rowtype;
  v_intent public.payment_intents%rowtype;
  v_receipt public.payment_receipts%rowtype;
  v_sub public.provider_subscriptions%rowtype;
  v_now timestamptz := now();
  v_effective_ends_at timestamptz;
  v_existing_entitlement_id uuid;
  v_source text;
  v_source_ref text;
  v_brandos_aid text;
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

  -- Latest receipt for this intent.
  select * into v_receipt
  from public.payment_receipts
  where payment_intent_id = v_intent.id
  order by created_at desc
  limit 1;

  v_source := coalesce(v_receipt.provider, v_intent.provider);
  v_source_ref := coalesce(v_receipt.provider_subscription_id, v_receipt.provider_session_id, v_intent.provider_session_id);

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

  -- Carry BrandOS token (if present) into membership-triggered automation.
  v_brandos_aid := nullif(coalesce(v_claim.tracking->>'brandos_aid', v_intent.tracking->>'brandos_aid'), '');
  if v_brandos_aid is not null and v_brandos_aid ~ '^[0-9a-fA-F-]{36}$' then
    perform set_config('arx.brandos_aid', v_brandos_aid, true);
  end if;

  -- Membership is always member; roles are manual-only.
  insert into public.community_memberships(community_id, user_id, role)
  values (v_intent.community_id, v_user_id, 'member')
  on conflict (community_id, user_id) do nothing;

  -- Upsert entitlement (time-bounded access).
  select id into v_existing_entitlement_id
  from public.entitlements
  where user_id = v_user_id
    and community_id = v_intent.community_id
  limit 1;

  if v_existing_entitlement_id is null then
    insert into public.entitlements(
      user_id,
      community_id,
      source,
      source_ref,
      starts_at,
      ends_at
    ) values (
      v_user_id,
      v_intent.community_id,
      v_source,
      v_source_ref,
      v_now,
      v_effective_ends_at
    );
  else
    update public.entitlements
      set source = v_source,
          source_ref = v_source_ref,
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
  select c.id, c.slug, c.name, v_effective_ends_at
  from public.communities c
  where c.id = v_intent.community_id;
end;
$$;
