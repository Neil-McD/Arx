-- Pending purchase recovery should not depend solely on email matching.
--
-- Improvements:
-- - If a user started checkout while signed in, `payment_intents.user_id` is set and recovery should
--   succeed even if Stripe checkout email differs from the auth email.
-- - Email matching remains as a fallback when `payment_intents.user_id` is NULL.

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
  select c.id, c.slug, c.name, pc.expires_at
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
  order by pc.created_at desc;
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
  v_sub public.provider_subscriptions%rowtype;
  v_now timestamptz := now();
  v_effective_ends_at timestamptz;
  v_existing_entitlement_id uuid;
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
  end loop;
end;
$$;

revoke all on function public.list_pending_purchase_claims() from public;
grant execute on function public.list_pending_purchase_claims() to authenticated;
grant execute on function public.list_pending_purchase_claims() to service_role;

revoke all on function public.redeem_pending_purchase_claims() from public;
grant execute on function public.redeem_pending_purchase_claims() to authenticated;
grant execute on function public.redeem_pending_purchase_claims() to service_role;

