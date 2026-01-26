-- Community settings v2: allow owner/admin to edit community settings,
-- and support one active plan per billing period (monthly/yearly).

-- Allow multiple active plans per community (one per billing_period).
drop index if exists public.uq_plans_one_active_per_community;
create unique index if not exists uq_plans_one_active_per_community_period
  on public.plans(community_id, billing_period)
  where is_active = true;

-- Read active pricing plans for a community (owner/admin only).
create or replace function public.get_community_pricing(p_community_id uuid)
returns table (
  billing_period text,
  plan_id uuid,
  amount_base_units numeric,
  currency text,
  currency_decimals smallint,
  visibility text,
  stripe_price_id text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;
  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  return query
  select
    p.billing_period,
    p.id as plan_id,
    p.amount_base_units,
    p.currency,
    p.currency_decimals,
    p.visibility,
    p.stripe_price_id
  from public.plans p
  where p.community_id = p_community_id
    and p.is_active = true
    and p.billing_period in ('monthly','yearly')
  order by case p.billing_period when 'monthly' then 0 else 1 end, p.updated_at desc;
end;
$$;

-- Save community settings + pricing in one transaction (owner/admin only).
create or replace function public.save_community_settings(
  p_community_id uuid,
  p_name text,
  p_slug text,
  p_description text default null,
  p_avatar_url text default null,
  p_banner_url text default null,
  p_visibility text default 'private',
  p_monthly_amount_base_units numeric default null,
  p_yearly_amount_base_units numeric default null,
  p_currency text default 'usd',
  p_currency_decimals smallint default 2
)
returns table (
  community_id uuid,
  name text,
  slug text,
  description text,
  avatar_url text,
  banner_url text,
  visibility text,
  updated_at timestamptz,
  monthly_plan_id uuid,
  yearly_plan_id uuid
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_visibility text;
  v_plan_visibility text;
  v_monthly_id uuid;
  v_yearly_id uuid;
  v_existing public.plans%rowtype;
  v_should_reset_stripe boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_slug, '')), '') is null then
    raise exception 'slug is required' using errcode = '22023';
  end if;

  v_visibility := lower(btrim(coalesce(p_visibility, 'private')));
  if v_visibility not in ('public','unlisted','private') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;
  v_plan_visibility := v_visibility;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  -- Community fields.
  update public.communities
     set name = btrim(p_name),
         slug = btrim(p_slug),
         description = nullif(btrim(coalesce(p_description, '')), ''),
         avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
         banner_url = nullif(btrim(coalesce(p_banner_url, '')), ''),
         visibility = v_visibility,
         updated_at = v_now
   where id = p_community_id;

  if not found then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  -- Helper: upsert an active plan for a billing period, or deactivate if null.
  -- Monthly
  if p_monthly_amount_base_units is null then
    update public.plans
       set is_active = false,
           updated_at = v_now
     where community_id = p_community_id
       and billing_period = 'monthly'
       and is_active = true;
  else
    if p_monthly_amount_base_units <= 0 then
      raise exception 'monthly_amount_must_be_positive' using errcode = '22023';
    end if;
    select * into v_existing
      from public.plans p
     where p.community_id = p_community_id
       and p.billing_period = 'monthly'
       and p.is_active = true
     order by p.updated_at desc
     limit 1;

    if found then
      v_should_reset_stripe :=
        v_existing.amount_base_units <> p_monthly_amount_base_units
        or v_existing.currency <> lower(btrim(coalesce(p_currency, 'usd')))
        or v_existing.currency_decimals <> p_currency_decimals;

      update public.plans
         set amount_base_units = p_monthly_amount_base_units,
             currency = lower(btrim(coalesce(p_currency, 'usd'))),
             currency_decimals = p_currency_decimals,
             visibility = v_plan_visibility,
             is_active = true,
             stripe_price_id = case when v_should_reset_stripe then null else stripe_price_id end,
             updated_at = v_now
       where id = v_existing.id
       returning id into v_monthly_id;
    else
      insert into public.plans(
        community_id,
        name,
        description,
        amount_base_units,
        currency,
        currency_decimals,
        billing_period,
        visibility,
        is_active,
        stripe_price_id,
        created_by,
        updated_at
      ) values (
        p_community_id,
        'Membership',
        null,
        p_monthly_amount_base_units,
        lower(btrim(coalesce(p_currency, 'usd'))),
        p_currency_decimals,
        'monthly',
        v_plan_visibility,
        true,
        null,
        v_user_id,
        v_now
      )
      returning id into v_monthly_id;
    end if;
  end if;

  -- Yearly
  if p_yearly_amount_base_units is null then
    update public.plans
       set is_active = false,
           updated_at = v_now
     where community_id = p_community_id
       and billing_period = 'yearly'
       and is_active = true;
  else
    if p_yearly_amount_base_units <= 0 then
      raise exception 'yearly_amount_must_be_positive' using errcode = '22023';
    end if;
    select * into v_existing
      from public.plans p
     where p.community_id = p_community_id
       and p.billing_period = 'yearly'
       and p.is_active = true
     order by p.updated_at desc
     limit 1;

    if found then
      v_should_reset_stripe :=
        v_existing.amount_base_units <> p_yearly_amount_base_units
        or v_existing.currency <> lower(btrim(coalesce(p_currency, 'usd')))
        or v_existing.currency_decimals <> p_currency_decimals;

      update public.plans
         set amount_base_units = p_yearly_amount_base_units,
             currency = lower(btrim(coalesce(p_currency, 'usd'))),
             currency_decimals = p_currency_decimals,
             visibility = v_plan_visibility,
             is_active = true,
             stripe_price_id = case when v_should_reset_stripe then null else stripe_price_id end,
             updated_at = v_now
       where id = v_existing.id
       returning id into v_yearly_id;
    else
      insert into public.plans(
        community_id,
        name,
        description,
        amount_base_units,
        currency,
        currency_decimals,
        billing_period,
        visibility,
        is_active,
        stripe_price_id,
        created_by,
        updated_at
      ) values (
        p_community_id,
        'Membership',
        null,
        p_yearly_amount_base_units,
        lower(btrim(coalesce(p_currency, 'usd'))),
        p_currency_decimals,
        'yearly',
        v_plan_visibility,
        true,
        null,
        v_user_id,
        v_now
      )
      returning id into v_yearly_id;
    end if;
  end if;

  return query
  select
    c.id,
    c.name,
    c.slug,
    c.description,
    c.avatar_url,
    c.banner_url,
    c.visibility,
    c.updated_at,
    v_monthly_id,
    v_yearly_id
  from public.communities c
  where c.id = p_community_id;
end;
$$;

