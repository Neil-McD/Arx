-- Cloud-canonical threads/messages for agent chat.
-- Ordering is server-assigned per-thread via threads.last_seq.

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text,
  engine_id text not null default 'arx_harness',
  model_id text,
  community_id uuid references public.communities(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seq bigint not null default 0
);

create index if not exists idx_threads_owner_updated_at on public.threads(owner_id, updated_at desc);
create index if not exists idx_threads_owner_created_at on public.threads(owner_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  seq bigint not null,
  role text not null check (role in ('user','assistant','system')),
  content_json jsonb not null,
  engine_id text,
  model_id text,
  run_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_messages_thread_seq_unique on public.messages(thread_id, seq);
create index if not exists idx_messages_thread_created_at on public.messages(thread_id, created_at desc);

-- Assign per-thread monotonic seq transactionally.
create or replace function public.next_thread_seq(_thread_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_seq bigint;
begin
  update public.threads
    set last_seq = last_seq + 1,
        updated_at = now()
  where id = _thread_id
  returning last_seq into v_seq;

  if v_seq is null then
    raise exception 'thread_not_found';
  end if;

  return v_seq;
end $$;

create or replace function public.messages_assign_seq()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.seq is null or new.seq = 0 then
    new.seq := public.next_thread_seq(new.thread_id);
  else
    -- Keep threads.last_seq consistent when backfilling or syncing explicit seq.
    update public.threads
      set last_seq = greatest(last_seq, new.seq),
          updated_at = now()
    where id = new.thread_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_messages_assign_seq on public.messages;
create trigger trg_messages_assign_seq
before insert on public.messages
for each row
execute function public.messages_assign_seq();

-- Basic RLS: threads/messages are private to the owner.
alter table public.threads enable row level security;

drop policy if exists threads_select_own on public.threads;
create policy threads_select_own
on public.threads
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists threads_insert_own on public.threads;
create policy threads_insert_own
on public.threads
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists threads_update_own on public.threads;
create policy threads_update_own
on public.threads
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists threads_delete_own on public.threads;
create policy threads_delete_own
on public.threads
for delete
to authenticated
using (owner_id = auth.uid());

alter table public.messages enable row level security;

drop policy if exists messages_select_own on public.messages;
create policy messages_select_own
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.threads t
    where t.id = messages.thread_id
      and t.owner_id = auth.uid()
  )
);

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own
on public.messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.threads t
    where t.id = messages.thread_id
      and t.owner_id = auth.uid()
  )
);

