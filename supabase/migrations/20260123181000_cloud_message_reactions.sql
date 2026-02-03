-- Reactions for messages (community chat + future thread UIs).
-- Kept separate from messages for minimal duplication and easy constraints.

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists idx_message_reactions_message_id on public.message_reactions(message_id);
create index if not exists idx_message_reactions_user_id on public.message_reactions(user_id);

alter table public.message_reactions enable row level security;

drop policy if exists message_reactions_select_visible_message on public.message_reactions;
create policy message_reactions_select_visible_message
on public.message_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_reactions.message_id
  )
);

drop policy if exists message_reactions_insert_own on public.message_reactions;
create policy message_reactions_insert_own
on public.message_reactions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages m
    where m.id = message_reactions.message_id
  )
);

drop policy if exists message_reactions_delete_own on public.message_reactions;
create policy message_reactions_delete_own
on public.message_reactions
for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages m
    where m.id = message_reactions.message_id
  )
);

