-- Cloud-canonical personal memory items.
-- Personal memory is explicit, user-controlled durable facts/preferences.

create table if not exists public.personal_memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  scope text not null check (scope in ('global', 'workspace')),
  scope_id text,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_personal_memory_items_user_scope_updated
  on public.personal_memory_items(user_id, scope, scope_id, updated_at desc);
create index if not exists idx_personal_memory_items_user_pinned_updated
  on public.personal_memory_items(user_id, pinned desc, updated_at desc);

alter table public.personal_memory_items enable row level security;

drop policy if exists personal_memory_items_select_own on public.personal_memory_items;
create policy personal_memory_items_select_own
on public.personal_memory_items
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists personal_memory_items_insert_own on public.personal_memory_items;
create policy personal_memory_items_insert_own
on public.personal_memory_items
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists personal_memory_items_update_own on public.personal_memory_items;
create policy personal_memory_items_update_own
on public.personal_memory_items
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists personal_memory_items_delete_own on public.personal_memory_items;
create policy personal_memory_items_delete_own
on public.personal_memory_items
for delete
to authenticated
using (user_id = auth.uid());

