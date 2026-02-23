-- Phase 1 Daytona runtime primitives:
-- - Paid tiers can create/use sandboxes
-- - Runtime runs/events tracked as canonical cloud execution ledger

create table if not exists public.daytona_sandboxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid null references public.threads(id) on delete set null,
  provider text not null default 'daytona',
  provider_sandbox_id text not null unique,
  status text not null check (status in ('provisioning', 'ready', 'paused', 'stopped', 'error')),
  region text null,
  tool_policy jsonb not null default '{}'::jsonb,
  ttl_expires_at timestamptz null,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_daytona_sandboxes_user_status_last_used
  on public.daytona_sandboxes (user_id, status, last_used_at desc);

create index if not exists idx_daytona_sandboxes_thread
  on public.daytona_sandboxes (thread_id);

create table if not exists public.runtime_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  lane text not null check (lane in ('public', 'daytona', 'chatgpt_desktop', 'platform_fallback')),
  model_id text null,
  requires_tools boolean not null default false,
  sandbox_id uuid null references public.daytona_sandboxes(id) on delete set null,
  idempotency_key text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancelled', 'timed_out')),
  error_code text null,
  error_message text null,
  usage_prompt_tokens integer null,
  usage_completion_tokens integer null,
  usage_total_tokens integer null,
  estimated_cost_microunits bigint null,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists idx_runtime_runs_thread_created
  on public.runtime_runs (thread_id, created_at desc);

create index if not exists idx_runtime_runs_user_status_created
  on public.runtime_runs (user_id, status, created_at desc);

create table if not exists public.runtime_run_events (
  id bigserial primary key,
  run_id uuid not null references public.runtime_runs(id) on delete cascade,
  seq bigint not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

create index if not exists idx_runtime_run_events_run_seq
  on public.runtime_run_events (run_id, seq asc);

drop trigger if exists trg_daytona_sandboxes_updated_at on public.daytona_sandboxes;
create trigger trg_daytona_sandboxes_updated_at
before update on public.daytona_sandboxes
for each row execute function public.set_updated_at();

drop trigger if exists trg_runtime_runs_updated_at on public.runtime_runs;
create trigger trg_runtime_runs_updated_at
before update on public.runtime_runs
for each row execute function public.set_updated_at();

alter table public.daytona_sandboxes enable row level security;
alter table public.runtime_runs enable row level security;
alter table public.runtime_run_events enable row level security;

drop policy if exists daytona_sandboxes_owner_select on public.daytona_sandboxes;
create policy daytona_sandboxes_owner_select
  on public.daytona_sandboxes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists daytona_sandboxes_owner_insert on public.daytona_sandboxes;
create policy daytona_sandboxes_owner_insert
  on public.daytona_sandboxes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists daytona_sandboxes_owner_update on public.daytona_sandboxes;
create policy daytona_sandboxes_owner_update
  on public.daytona_sandboxes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists runtime_runs_owner_select on public.runtime_runs;
create policy runtime_runs_owner_select
  on public.runtime_runs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists runtime_runs_owner_insert on public.runtime_runs;
create policy runtime_runs_owner_insert
  on public.runtime_runs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists runtime_runs_owner_update on public.runtime_runs;
create policy runtime_runs_owner_update
  on public.runtime_runs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists runtime_run_events_owner_select on public.runtime_run_events;
create policy runtime_run_events_owner_select
  on public.runtime_run_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.runtime_runs r
      where r.id = runtime_run_events.run_id
        and r.user_id = auth.uid()
    )
  );

grant select, insert, update on table public.daytona_sandboxes to authenticated;
grant select, insert, update on table public.runtime_runs to authenticated;
grant select on table public.runtime_run_events to authenticated;
