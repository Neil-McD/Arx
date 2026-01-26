-- Community revenue series (provider/rail-agnostic).
--
-- Always returns a bucketed series (flat 0 line if no receipts yet) so the UI
-- renders consistently with other analytics charts.

create or replace function public.community_revenue_series(
  p_community_id uuid,
  p_range text
)
returns table(
  bucket_start timestamptz,
  gross_base_units numeric,
  platform_fee_base_units numeric,
  net_base_units numeric,
  currency text,
  currency_decimals smallint
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_bucket text;
  v_step interval;
  v_since timestamptz;
  v_series_start timestamptz;
  v_series_end timestamptz;
  v_currency text;
  v_decimals smallint;
  v_currency_count integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  case coalesce(p_range, '30d')
    when '7d' then
      v_bucket := 'day';
      v_step := interval '1 day';
      v_since := date_trunc('day', v_now) - interval '6 days';
    when '30d' then
      v_bucket := 'day';
      v_step := interval '1 day';
      v_since := date_trunc('day', v_now) - interval '29 days';
    when '90d' then
      v_bucket := 'week';
      v_step := interval '1 week';
      v_since := date_trunc('day', v_now) - interval '89 days';
    when '1y' then
      v_bucket := 'month';
      v_step := interval '1 month';
      v_since := date_trunc('month', v_now) - interval '11 months';
    when 'all' then
      v_bucket := 'month';
      v_step := interval '1 month';
      v_since := null;
    else
      v_bucket := 'day';
      v_step := interval '1 day';
      v_since := date_trunc('day', v_now) - interval '29 days';
  end case;

  -- Determine currency for the series (MVP: require single currency per community).
  select count(distinct r.currency)
    into v_currency_count
    from public.payment_receipts r
    join public.payment_intents i on i.id = r.payment_intent_id
   where i.community_id = p_community_id
     and r.status = 'confirmed'
     and r.paid_at is not null;

  if coalesce(v_currency_count, 0) > 1 then
    raise exception 'multi_currency_not_supported' using errcode = '22023';
  end if;

  if coalesce(v_currency_count, 0) = 1 then
    select r.currency, r.currency_decimals
      into v_currency, v_decimals
      from public.payment_receipts r
      join public.payment_intents i on i.id = r.payment_intent_id
     where i.community_id = p_community_id
       and r.status = 'confirmed'
       and r.paid_at is not null
     order by r.paid_at asc
     limit 1;
  else
    -- No receipts yet: infer currency from active plans, else default to USD.
    select p.currency, p.currency_decimals
      into v_currency, v_decimals
      from public.plans p
     where p.community_id = p_community_id
       and p.is_active = true
       and p.billing_period in ('monthly','yearly')
     order by p.updated_at desc
     limit 1;

    if v_currency is null or v_decimals is null then
      v_currency := 'usd';
      v_decimals := 2;
    end if;
  end if;

  v_series_start := date_trunc(
    v_bucket,
    coalesce(
      v_since,
      (select min(r.paid_at)
         from public.payment_receipts r
         join public.payment_intents i on i.id = r.payment_intent_id
        where i.community_id = p_community_id
          and r.status = 'confirmed'
          and r.paid_at is not null
      ),
      (select c.created_at from public.communities c where c.id = p_community_id)
    )
  );
  if v_series_start is null then
    v_series_start := date_trunc(v_bucket, v_now);
  end if;

  v_series_end := date_trunc(v_bucket, v_now);

  return query
  with buckets as (
    select generate_series(v_series_start, v_series_end, v_step) as bucket_start
  ),
  revenue as (
    select
      date_trunc(v_bucket, r.paid_at) as bucket_start,
      sum(r.amount_base_units) as gross_base_units,
      sum(
        coalesce(
          r.platform_fee_amount_base_units,
          (r.amount_base_units * r.platform_fee_bps) / 10000
        )
      ) as platform_fee_base_units,
      sum(
        r.amount_base_units
        - coalesce(
          r.platform_fee_amount_base_units,
          (r.amount_base_units * r.platform_fee_bps) / 10000
        )
      ) as net_base_units
    from public.payment_receipts r
    join public.payment_intents i on i.id = r.payment_intent_id
    where i.community_id = p_community_id
      and r.status = 'confirmed'
      and r.paid_at is not null
      and (v_since is null or r.paid_at >= v_since)
    group by 1
  )
  select
    b.bucket_start,
    coalesce(rv.gross_base_units, 0)::numeric as gross_base_units,
    coalesce(rv.platform_fee_base_units, 0)::numeric as platform_fee_base_units,
    coalesce(rv.net_base_units, 0)::numeric as net_base_units,
    v_currency,
    v_decimals
  from buckets b
  left join revenue rv using (bucket_start)
  order by b.bucket_start asc;
end;
$$;

