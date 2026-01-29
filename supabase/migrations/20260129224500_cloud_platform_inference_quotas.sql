-- Platform-provided inference quotas (builders-only).
--
-- Intent:
-- - Arx may optionally provide OpenRouter inference using a platform key.
-- - This is builders-only (Starter/Pro), and must be quota-capped server-side.
-- - Enforcement must be atomic and non-bypassable by clients.

create table if not exists public.user_platform_inference_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  standard_used integer not null default 0 check (standard_used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

create index if not exists idx_user_platform_inference_usage_updated_at
on public.user_platform_inference_usage(updated_at desc);

alter table public.user_platform_inference_usage enable row level security;
-- Intentionally no RLS policies (deny all). This table is accessed via SECURITY DEFINER RPC.

create or replace function public.platform_inference_standard_cap_for_builder_tier(p_tier text)
returns integer
language sql
stable
as $$
  select case
    when lower(coalesce(p_tier, '')) = 'pro' then 2000
    when lower(coalesce(p_tier, '')) = 'builder' then 300
    else 0
  end;
$$;

create or replace function public.consume_platform_inference_standard(
  p_user_id uuid,
  p_units integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_now timestamptz := now();
  v_period date := date_trunc('month', v_now)::date;
  v_tier text;
  v_cap integer;
  v_used integer;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  if p_units is null or p_units <= 0 then
    raise exception 'units_required' using errcode = '22023';
  end if;

  select p.builder_tier
    into v_tier
    from public.profiles p
   where p.user_id = p_user_id
   limit 1;

  v_cap := public.platform_inference_standard_cap_for_builder_tier(coalesce(v_tier, ''));

  if v_cap <= 0 then
    raise exception 'platform_inference_not_allowed' using errcode = '42501';
  end if;

  insert into public.user_platform_inference_usage(user_id, period_start, standard_used, updated_at)
  values (p_user_id, v_period, 0, v_now)
  on conflict (user_id, period_start) do nothing;

  select u.standard_used
    into v_used
    from public.user_platform_inference_usage u
   where u.user_id = p_user_id
     and u.period_start = v_period
   for update;

  if v_used is null then
    v_used := 0;
  end if;

  if (v_used + p_units) > v_cap then
    raise exception 'platform_inference_quota_exceeded' using errcode = '42501';
  end if;

  update public.user_platform_inference_usage
     set standard_used = v_used + p_units,
         updated_at = v_now
   where user_id = p_user_id
     and period_start = v_period
   returning standard_used into v_used;

  return greatest(0, v_cap - v_used);
end;
$$;

revoke all on function public.platform_inference_standard_cap_for_builder_tier(text) from public;
revoke all on function public.platform_inference_standard_cap_for_builder_tier(text) from anon;
revoke all on function public.platform_inference_standard_cap_for_builder_tier(text) from authenticated;
revoke all on function public.platform_inference_standard_cap_for_builder_tier(text) from service_role;
grant execute on function public.platform_inference_standard_cap_for_builder_tier(text) to service_role;

revoke all on function public.consume_platform_inference_standard(uuid, integer) from public;
revoke all on function public.consume_platform_inference_standard(uuid, integer) from anon;
revoke all on function public.consume_platform_inference_standard(uuid, integer) from authenticated;
revoke all on function public.consume_platform_inference_standard(uuid, integer) from service_role;
grant execute on function public.consume_platform_inference_standard(uuid, integer) to service_role;

