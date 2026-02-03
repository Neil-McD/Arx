-- Edge-function rate limiting primitives.
-- Used to protect unauthenticated endpoints (e.g. checkout_start) from abuse.

create table if not exists public.edge_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  window_seconds integer not null check (window_seconds > 0),
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists idx_edge_rate_limits_updated_at on public.edge_rate_limits(updated_at desc);

alter table public.edge_rate_limits enable row level security;

-- Intentionally no RLS policies (deny all). This table is written/read via SECURITY DEFINER RPC.

create or replace function public.edge_rate_limit_allow(
  p_key text,
  p_window_seconds integer,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
begin
  if p_key is null or btrim(p_key) = '' then
    raise exception 'rate_limit_key_required' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'rate_limit_window_required' using errcode = '22023';
  end if;
  if p_limit is null or p_limit <= 0 then
    raise exception 'rate_limit_limit_required' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);

  insert into public.edge_rate_limits(key, window_start, window_seconds, count, updated_at)
  values (btrim(p_key), v_window_start, p_window_seconds, 1, v_now)
  on conflict (key) do update set
    window_start = excluded.window_start,
    window_seconds = excluded.window_seconds,
    count = case
      when edge_rate_limits.window_start = excluded.window_start then edge_rate_limits.count + 1
      else 1
    end,
    updated_at = v_now
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;
