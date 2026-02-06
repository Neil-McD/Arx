-- Extend admin member list with subscription plan details so the web Members tab
-- can filter by plan cohorts (grandfathered prices) without exposing Stripe internals.

drop function if exists public.list_community_members_admin(uuid);

create or replace function public.list_community_members_admin(p_community_id uuid)
returns table (
  id uuid,
  community_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  is_entitled boolean,
  entitlement_ends_at timestamptz,
  access_status text,
  subscription_plan_id uuid,
  subscription_billing_period text,
  subscription_amount_base_units numeric,
  subscription_currency text,
  subscription_currency_decimals smallint
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

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin','mod']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  return query
  select
    m.id,
    m.community_id,
    m.user_id,
    m.role,
    m.created_at,
    public.user_has_active_entitlement(m.user_id, m.community_id) as is_entitled,
    e.ends_at as entitlement_ends_at,
    case
      when public.user_has_active_entitlement(m.user_id, m.community_id) then 'active'
      else 'declined'
    end as access_status,
    ps_summary.plan_id as subscription_plan_id,
    ps_summary.billing_period as subscription_billing_period,
    ps_summary.amount_base_units as subscription_amount_base_units,
    ps_summary.currency as subscription_currency,
    ps_summary.currency_decimals as subscription_currency_decimals
  from public.community_memberships m
  left join public.entitlements e
    on e.user_id = m.user_id
   and e.community_id = m.community_id
  left join lateral (
    select
      ps.plan_id,
      p.billing_period,
      p.amount_base_units,
      p.currency,
      p.currency_decimals
    from public.provider_subscriptions ps
    join public.plans p
      on p.id = ps.plan_id
    where ps.community_id = m.community_id
      and ps.user_id = m.user_id
    order by ps.updated_at desc
    limit 1
  ) as ps_summary on true
  where m.community_id = p_community_id
  order by m.created_at asc;
end;
$$;

revoke all on function public.list_community_members_admin(uuid) from public;
grant execute on function public.list_community_members_admin(uuid) to authenticated;
grant execute on function public.list_community_members_admin(uuid) to service_role;
