-- Canonical user product state (authenticated).
--
-- Purpose:
-- - Provide one server source for free/builder/pro plan state.
-- - Keep plan/tier semantics and quota surfaces in one RPC.
-- - Remove legacy get_builder_billing_status() compatibility wrapper.

drop function if exists public.get_my_product_state();
create or replace function public.get_my_product_state()
returns table(
  user_id uuid,
  auth_state text,
  builder_tier text,
  builder_plan_code text,
  builder_plan_price_usd integer,
  is_builder_paid boolean,
  max_communities integer,
  platform_fee_bps integer,
  has_payouts boolean,
  subscription_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  ai_history_bytes_used bigint,
  ai_history_bytes_cap bigint,
  platform_inference_standard_used integer,
  platform_inference_standard_cap integer
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_tier text := 'free';
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select lower(coalesce(p.builder_tier, 'free'))
    into v_tier
    from public.profiles p
   where p.user_id = v_user_id
   limit 1;

  if v_tier not in ('free', 'builder', 'pro') then
    v_tier := 'free';
  end if;

  return query
  select
    v_user_id as user_id,
    'linked_identity'::text as auth_state,
    v_tier as builder_tier,
    case
      when v_tier = 'pro' then 'pro_100'
      when v_tier = 'builder' then 'builder_20'
      else 'free'
    end as builder_plan_code,
    case
      when v_tier = 'pro' then 100
      when v_tier = 'builder' then 20
      else 0
    end as builder_plan_price_usd,
    (v_tier in ('builder', 'pro')) as is_builder_paid,
    public.max_communities_for_builder_tier(v_tier) as max_communities,
    case
      when v_tier = 'pro' then 300
      when v_tier = 'builder' then 1000
      else 1000
    end as platform_fee_bps,
    (ba.stripe_connected_account_id is not null) as has_payouts,
    bs.status as subscription_status,
    bs.current_period_end,
    bs.cancel_at_period_end,
    coalesce(ahu.bytes_used, 0)::bigint as ai_history_bytes_used,
    public.max_ai_history_bytes_for_builder_tier(v_tier) as ai_history_bytes_cap,
    coalesce(piu.standard_used, 0) as platform_inference_standard_used,
    public.platform_inference_standard_cap_for_builder_tier(v_tier) as platform_inference_standard_cap
  from (select 1) as anchor
  left join public.builder_accounts ba on ba.user_id = v_user_id
  left join lateral (
    select b.status, b.current_period_end, b.cancel_at_period_end
    from public.builder_subscriptions b
    where b.user_id = v_user_id
      and b.provider = 'stripe'
    order by b.updated_at desc
    limit 1
  ) bs on true
  left join public.user_ai_history_usage ahu on ahu.user_id = v_user_id
  left join public.user_platform_inference_usage piu
    on piu.user_id = v_user_id
   and piu.period_start = date_trunc('month', now())::date;
end;
$$;

revoke all on function public.get_my_product_state() from public;
revoke all on function public.get_my_product_state() from anon;
revoke all on function public.get_my_product_state() from authenticated;
revoke all on function public.get_my_product_state() from service_role;
grant execute on function public.get_my_product_state() to authenticated;
grant execute on function public.get_my_product_state() to service_role;

drop function if exists public.get_builder_billing_status();
