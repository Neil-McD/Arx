-- Builder billing + Connect onboarding primitives.
--
-- Goals:
-- - Keep profiles safe to select across members (no Stripe IDs stored on profiles).
-- - Store builder Stripe customer + connected account IDs in a separate table (self-readable, service-controlled).
-- - Track builder SaaS subscription mapping separately from community member subscriptions.
-- - Enforce pay-first join: public joins are only allowed when a community has no active paid plan.

create table if not exists public.builder_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_connected_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists builder_accounts_set_updated_at on public.builder_accounts;
create trigger builder_accounts_set_updated_at
before update on public.builder_accounts
for each row
execute function public.set_updated_at();

alter table public.builder_accounts enable row level security;

drop policy if exists builder_accounts_select_own on public.builder_accounts;
create policy builder_accounts_select_own
on public.builder_accounts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists builder_accounts_service_role_all on public.builder_accounts;
create policy builder_accounts_service_role_all
on public.builder_accounts
for all
to service_role
using (true)
with check (true);

create table if not exists public.builder_subscriptions (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  provider_subscription_id text not null,
  provider_customer_id text,
  user_id uuid references auth.users(id) on delete set null,
  builder_tier text not null check (builder_tier in ('builder','pro')),
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  raw_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

drop trigger if exists builder_subscriptions_set_updated_at on public.builder_subscriptions;
create trigger builder_subscriptions_set_updated_at
before update on public.builder_subscriptions
for each row
execute function public.set_updated_at();

create index if not exists idx_builder_subscriptions_user on public.builder_subscriptions(user_id, updated_at desc);

alter table public.builder_subscriptions enable row level security;

drop policy if exists builder_subscriptions_service_role_all on public.builder_subscriptions;
create policy builder_subscriptions_service_role_all
on public.builder_subscriptions
for all
to service_role
using (true)
with check (true);

-- Read-only builder billing status for the signed-in user.
drop function if exists public.get_builder_billing_status();
create or replace function public.get_builder_billing_status()
returns table(
  user_id uuid,
  builder_tier text,
  max_communities integer,
  platform_fee_bps integer,
  has_payouts boolean,
  subscription_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean
)
language sql
security definer
set search_path = public
set row_security = off
as $$
  select
    auth.uid() as user_id,
    coalesce(p.builder_tier, 'free') as builder_tier,
    public.max_communities_for_builder_tier(coalesce(p.builder_tier, 'free')) as max_communities,
    case
      when lower(coalesce(p.builder_tier, '')) = 'pro' then 300
      when lower(coalesce(p.builder_tier, '')) = 'builder' then 1000
      else 1000
    end as platform_fee_bps,
    (ba.stripe_connected_account_id is not null) as has_payouts,
    bs.status as subscription_status,
    bs.current_period_end,
    bs.cancel_at_period_end
  from public.profiles p
  left join public.builder_accounts ba on ba.user_id = p.user_id
  left join lateral (
    select b.status, b.current_period_end, b.cancel_at_period_end
    from public.builder_subscriptions b
    where b.user_id = auth.uid()
      and b.provider = 'stripe'
    order by b.updated_at desc
    limit 1
  ) bs on true
  where p.user_id = auth.uid();
$$;

revoke all on function public.get_builder_billing_status() from public;
grant execute on function public.get_builder_billing_status() to authenticated;
grant execute on function public.get_builder_billing_status() to service_role;

-- Pay-first join enforcement:
-- If a public community has an active paid plan, users must join via purchase claim redemption.
create or replace function public.join_public_community(p_community_id uuid)
returns table(community_id uuid, community_slug text, community_name text)
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

  if exists (
    select 1
    from public.plans p
    where p.community_id = p_community_id
      and p.is_active = true
      and p.billing_period in ('monthly','yearly')
  ) then
    raise exception 'Payment required to join this community' using errcode = '42501';
  end if;

  insert into public.community_memberships(community_id, user_id, role)
  values (p_community_id, auth.uid(), 'member')
  on conflict (community_id, user_id) do nothing;

  insert into public.entitlements(
    user_id,
    community_id,
    source,
    source_ref,
    starts_at,
    ends_at
  ) values (
    auth.uid(),
    p_community_id,
    'public_join',
    p_community_id::text,
    v_now,
    null
  )
  on conflict (user_id, community_id)
  do update set
    source = excluded.source,
    source_ref = excluded.source_ref,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    ends_at = null
  where entitlements.ends_at is not null
    and entitlements.ends_at <= v_now;

  return query
  select c.id, c.slug, c.name
    from public.communities c
   where c.id = p_community_id;
end;
$$;

