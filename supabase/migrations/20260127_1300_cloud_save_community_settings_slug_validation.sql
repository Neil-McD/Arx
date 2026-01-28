-- Ensure community settings updates enforce the same slug rules as create_community.
-- Canonical slugs are lowercase, 3–32 chars, [a-z0-9-], and cannot start/end with '-'.

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
  v_slug text;
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

  v_slug := lower(btrim(coalesce(p_slug, '')));
  if v_slug = '' then
    raise exception 'slug is required' using errcode = '22023';
  end if;
  if length(v_slug) < 3 or length(v_slug) > 32 or v_slug !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;

  v_visibility := lower(btrim(coalesce(p_visibility, 'private')));
  if v_visibility not in ('public','unlisted','private') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;

  -- Pricing should be visible for public + private landings, and for unlisted by direct link.
  v_plan_visibility := case when v_visibility = 'unlisted' then 'unlisted' else 'public' end;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  -- Community fields.
  update public.communities
     set name = btrim(p_name),
         slug = v_slug,
         description = nullif(btrim(coalesce(p_description, '')), ''),
         avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
         banner_url = nullif(btrim(coalesce(p_banner_url, '')), ''),
         visibility = v_visibility,
         updated_at = v_now
   where id = p_community_id;

  if not found then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  -- Monthly
  if p_monthly_amount_base_units is null then
    update public.plans p
       set is_active = false,
           updated_at = v_now
     where p.community_id = p_community_id
       and p.billing_period = 'monthly'
       and p.is_active = true;
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
    update public.plans p
       set is_active = false,
           updated_at = v_now
     where p.community_id = p_community_id
       and p.billing_period = 'yearly'
       and p.is_active = true;
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
