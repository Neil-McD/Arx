-- Cloud runtime pause/resume states + explicit tool decision records.

alter table public.runtime_runs
  drop constraint if exists runtime_runs_status_check;

alter table public.runtime_runs
  add constraint runtime_runs_status_check
  check (
    status in (
      'queued',
      'running',
      'awaiting_approval',
      'resuming',
      'completed',
      'failed',
      'cancelled',
      'timed_out'
    )
  );

create table if not exists public.runtime_tool_decisions (
  id bigserial primary key,
  run_id uuid not null references public.runtime_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_call_id text not null,
  approved boolean not null,
  note text null,
  decided_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, tool_call_id)
);

create index if not exists idx_runtime_tool_decisions_run_created
  on public.runtime_tool_decisions (run_id, created_at desc);

create index if not exists idx_runtime_tool_decisions_user_created
  on public.runtime_tool_decisions (user_id, created_at desc);

drop trigger if exists trg_runtime_tool_decisions_updated_at on public.runtime_tool_decisions;
create trigger trg_runtime_tool_decisions_updated_at
before update on public.runtime_tool_decisions
for each row execute function public.set_updated_at();

alter table public.runtime_tool_decisions enable row level security;

drop policy if exists runtime_tool_decisions_owner_select on public.runtime_tool_decisions;
create policy runtime_tool_decisions_owner_select
  on public.runtime_tool_decisions
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.runtime_runs r
      where r.id = runtime_tool_decisions.run_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists runtime_tool_decisions_owner_insert on public.runtime_tool_decisions;
create policy runtime_tool_decisions_owner_insert
  on public.runtime_tool_decisions
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.runtime_runs r
      where r.id = runtime_tool_decisions.run_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists runtime_tool_decisions_owner_update on public.runtime_tool_decisions;
create policy runtime_tool_decisions_owner_update
  on public.runtime_tool_decisions
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.runtime_runs r
      where r.id = runtime_tool_decisions.run_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.runtime_runs r
      where r.id = runtime_tool_decisions.run_id
        and r.user_id = auth.uid()
    )
  );

grant select, insert, update on table public.runtime_tool_decisions to authenticated;
