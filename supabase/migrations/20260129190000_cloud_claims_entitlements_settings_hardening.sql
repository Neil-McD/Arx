-- Claim + entitlement hardening.
--
-- Goals:
-- - checkout_finalize retries should not invalidate previously issued claim tokens.
-- - Subscription claims must not accidentally mint indefinite access when provider_subscriptions is missing.
-- - Claim redemption must never shorten an existing entitlement.
-- - Per-member settings should be gated by canonical access (entitlements) to avoid "settings for any community".

-- Allow multiple issued claims per payment_intent (prevents retries from invalidating old tokens).
drop index if exists public.uq_purchase_claims_one_issued_per_intent;

create or replace function public.list_pending_purchase_claims()
returns table(
  community_id uuid,
  community_slug text,
  community_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_email text;
  v_now timestamptz := now();
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = v_user_id;

  v_email := lower(btrim(coalesce(v_email, '')));

  return query
  select out.community_id, out.community_slug, out.community_name, out.expires_at
  from (
    select distinct on (pi.community_id)
      c.id as community_id,
      c.slug as community_slug,
      c.name as community_name,
      pc.expires_at,
      pc.created_at
    from public.purchase_claims pc
    join public.payment_intents pi on pi.id = pc.payment_intent_id
    join public.communities c on c.id = pi.community_id
    where pc.status = 'issued'
      and pc.expires_at > v_now
      and pi.status = 'succeeded'
      and (
        (pi.user_id is not null and pi.user_id = v_user_id)
        or (
          pi.user_id is null
          and pc.issued_to_email is not null
          and lower(btrim(pc.issued_to_email)) = v_email
        )
      )
    order by pi.community_id, pc.created_at desc
  ) out
  order by out.created_at desc;
end;
$$;

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
  v_plan public.plans%rowtype;
  v_sub public.provider_subscriptions%rowtype;
  v_now timestamptz := now();
  v_effective_ends_at timestamptz;
  v_return_ends_at timestamptz;
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

  select * into v_plan
  from public.plans
  where id = v_intent.plan_id;

  if not found then
    raise exception 'invalid_or_expired' using errcode = '22023';
  end if;

  -- Latest receipt for this intent (may be missing in rare cases; subscription fallback covers this).
  select * into v_receipt
  from public.payment_receipts
  where payment_intent_id = v_intent.id
  order by created_at desc
  limit 1;

  v_source := coalesce(v_receipt.provider, v_intent.provider);
  v_source_ref := coalesce(v_receipt.provider_subscription_id, v_receipt.provider_session_id, v_intent.provider_session_id);

  v_effective_ends_at := null;

  if v_plan.billing_period <> 'one_time' then
    -- Subscription claims must have a provider subscription mapping to avoid minting unlimited access.
    if v_receipt.provider_subscription_id is not null then
      select * into v_sub
      from public.provider_subscriptions
      where provider = v_receipt.provider
        and provider_subscription_id = v_receipt.provider_subscription_id
      for update;
    else
      select * into v_sub
      from public.provider_subscriptions
      where payment_intent_id = v_intent.id
      order by updated_at desc
      limit 1
      for update;
    end if;

    if not found or v_sub.current_period_end is null then
      raise exception 'subscription_not_ready' using errcode = '22023';
    end if;

    v_effective_ends_at := v_sub.current_period_end;
    v_source := v_sub.provider;
    v_source_ref := v_sub.provider_subscription_id;

    if v_sub.user_id is null then
      update public.provider_subscriptions
        set user_id = v_user_id,
            updated_at = v_now
      where id = v_sub.id;
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

  -- Canonical access: merge entitlements monotonically (never shorten).
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
  )
  on conflict (user_id, community_id)
  do update set
    ends_at = case
      when entitlements.ends_at is null then null
      when excluded.ends_at is null then null
      else greatest(entitlements.ends_at, excluded.ends_at)
    end,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    source = case
      when entitlements.ends_at is null then entitlements.source
      else excluded.source
    end,
    source_ref = case
      when entitlements.ends_at is null then entitlements.source_ref
      else excluded.source_ref
    end
  returning ends_at into v_return_ends_at;

  -- Mark other issued tokens for the same intent as revoked (single-use at the intent level).
  update public.purchase_claims
    set status = 'revoked'
  where payment_intent_id = v_claim.payment_intent_id
    and status = 'issued'
    and id <> v_claim.id;

  update public.purchase_claims
    set status = 'redeemed',
        redeemed_by_user_id = v_user_id,
        redeemed_at = v_now
  where id = v_claim.id;

  return query
  select c.id, c.slug, c.name, v_return_ends_at
  from public.communities c
  where c.id = v_intent.community_id;
end;
$$;

create or replace function public.redeem_pending_purchase_claims()
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
  v_email text;
  v_claim public.purchase_claims%rowtype;
  v_intent public.payment_intents%rowtype;
  v_receipt public.payment_receipts%rowtype;
  v_plan public.plans%rowtype;
  v_sub public.provider_subscriptions%rowtype;
  v_now timestamptz := now();
  v_effective_ends_at timestamptz;
  v_return_ends_at timestamptz;
  v_source text;
  v_source_ref text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = v_user_id;

  v_email := lower(btrim(coalesce(v_email, '')));

  for v_claim in
    select pc.*
    from (
      select distinct on (pc.payment_intent_id) pc.id
      from public.purchase_claims pc
      join public.payment_intents pi on pi.id = pc.payment_intent_id
      where pc.status = 'issued'
        and pc.expires_at > v_now
        and pi.status = 'succeeded'
        and (
          (pi.user_id is not null and pi.user_id = v_user_id)
          or (
            pi.user_id is null
            and pc.issued_to_email is not null
            and lower(btrim(pc.issued_to_email)) = v_email
          )
        )
      order by pc.payment_intent_id, pc.created_at desc
    ) pick
    join public.purchase_claims pc on pc.id = pick.id
    order by pc.created_at desc
    for update of pc skip locked
  loop
    select * into v_intent
    from public.payment_intents
    where id = v_claim.payment_intent_id
    for update;

    if not found then
      continue;
    end if;

    if v_intent.status <> 'succeeded' then
      continue;
    end if;

    -- If already bound, enforce same user.
    if v_intent.user_id is not null and v_intent.user_id <> v_user_id then
      continue;
    end if;

    select * into v_plan
    from public.plans
    where id = v_intent.plan_id;

    if not found then
      continue;
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

    if v_plan.billing_period <> 'one_time' then
      if v_receipt.provider_subscription_id is not null then
        select * into v_sub
        from public.provider_subscriptions
        where provider = v_receipt.provider
          and provider_subscription_id = v_receipt.provider_subscription_id
        for update;
      else
        select * into v_sub
        from public.provider_subscriptions
        where payment_intent_id = v_intent.id
        order by updated_at desc
        limit 1
        for update;
      end if;

      -- If the subscription mapping isn't ready yet, skip this claim (user can retry later).
      if not found or v_sub.current_period_end is null then
        continue;
      end if;

      v_effective_ends_at := v_sub.current_period_end;
      v_source := v_sub.provider;
      v_source_ref := v_sub.provider_subscription_id;

      if v_sub.user_id is null then
        update public.provider_subscriptions
          set user_id = v_user_id,
              updated_at = v_now
        where id = v_sub.id;
      end if;
    end if;

    if v_intent.user_id is null then
      update public.payment_intents
        set user_id = v_user_id,
            updated_at = v_now
      where id = v_intent.id;
    end if;

    insert into public.community_memberships(community_id, user_id, role)
    values (v_intent.community_id, v_user_id, 'member')
    on conflict (community_id, user_id) do nothing;

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
    )
    on conflict (user_id, community_id)
    do update set
      ends_at = case
        when entitlements.ends_at is null then null
        when excluded.ends_at is null then null
        else greatest(entitlements.ends_at, excluded.ends_at)
      end,
      starts_at = least(entitlements.starts_at, excluded.starts_at),
      source = case
        when entitlements.ends_at is null then entitlements.source
        else excluded.source
      end,
      source_ref = case
        when entitlements.ends_at is null then entitlements.source_ref
        else excluded.source_ref
      end
    returning ends_at into v_return_ends_at;

    -- Revoke any other issued tokens for the same intent.
    update public.purchase_claims
      set status = 'revoked'
    where payment_intent_id = v_claim.payment_intent_id
      and status = 'issued'
      and id <> v_claim.id;

    update public.purchase_claims
      set status = 'redeemed',
          redeemed_by_user_id = v_user_id,
          redeemed_at = v_now
    where id = v_claim.id;

    return query
    select c.id, c.slug, c.name, v_return_ends_at
    from public.communities c
    where c.id = v_intent.community_id;
  end loop;
end;
$$;

-- Harden per-member settings: require active entitlement (or owner) for the target community.
drop policy if exists community_member_settings_select_self on public.community_member_settings;
create policy community_member_settings_select_self
on public.community_member_settings
for select
to authenticated
using (
  user_id = auth.uid()
  and (
    public.has_active_entitlement(community_id)
    or exists (
      select 1
      from public.communities c
      where c.id = community_member_settings.community_id
        and c.owner_id = auth.uid()
    )
  )
);

drop policy if exists community_member_settings_insert_self on public.community_member_settings;
create policy community_member_settings_insert_self
on public.community_member_settings
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    public.has_active_entitlement(community_id)
    or exists (
      select 1
      from public.communities c
      where c.id = community_member_settings.community_id
        and c.owner_id = auth.uid()
    )
  )
);

drop policy if exists community_member_settings_update_self on public.community_member_settings;
create policy community_member_settings_update_self
on public.community_member_settings
for update
to authenticated
using (
  user_id = auth.uid()
  and (
    public.has_active_entitlement(community_id)
    or exists (
      select 1
      from public.communities c
      where c.id = community_member_settings.community_id
        and c.owner_id = auth.uid()
    )
  )
)
with check (
  user_id = auth.uid()
  and (
    public.has_active_entitlement(community_id)
    or exists (
      select 1
      from public.communities c
      where c.id = community_member_settings.community_id
        and c.owner_id = auth.uid()
    )
  )
);

drop policy if exists community_member_settings_delete_self on public.community_member_settings;
create policy community_member_settings_delete_self
on public.community_member_settings
for delete
to authenticated
using (
  user_id = auth.uid()
  and (
    public.has_active_entitlement(community_id)
    or exists (
      select 1
      from public.communities c
      where c.id = community_member_settings.community_id
        and c.owner_id = auth.uid()
    )
  )
);

-- Grants (defense-in-depth; CREATE OR REPLACE should keep existing grants, but keep these explicit).
revoke all on function public.list_pending_purchase_claims() from public;
revoke all on function public.list_pending_purchase_claims() from anon;
revoke all on function public.list_pending_purchase_claims() from authenticated;
revoke all on function public.list_pending_purchase_claims() from service_role;
grant execute on function public.list_pending_purchase_claims() to authenticated;
grant execute on function public.list_pending_purchase_claims() to service_role;

revoke all on function public.redeem_pending_purchase_claims() from public;
revoke all on function public.redeem_pending_purchase_claims() from anon;
revoke all on function public.redeem_pending_purchase_claims() from authenticated;
revoke all on function public.redeem_pending_purchase_claims() from service_role;
grant execute on function public.redeem_pending_purchase_claims() to authenticated;
grant execute on function public.redeem_pending_purchase_claims() to service_role;

revoke all on function public.redeem_purchase_claim(text) from public;
revoke all on function public.redeem_purchase_claim(text) from anon;
revoke all on function public.redeem_purchase_claim(text) from authenticated;
revoke all on function public.redeem_purchase_claim(text) from service_role;
grant execute on function public.redeem_purchase_claim(text) to authenticated;
grant execute on function public.redeem_purchase_claim(text) to service_role;
