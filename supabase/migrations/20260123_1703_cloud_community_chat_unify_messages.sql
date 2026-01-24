-- Unify community chat onto cloud-canonical threads/messages.
--
-- Contract:
-- - community chat thread id == community_id
-- - threads.engine_id = 'community_chat'
-- - access is membership-based (not thread owner-based)

alter table public.messages
  add column if not exists sender_id uuid,
  add column if not exists reply_to_id uuid;

create index if not exists idx_messages_thread_sender_id on public.messages(thread_id, sender_id);
create index if not exists idx_messages_reply_to_id on public.messages(reply_to_id);

-- Threads: private to owner, except community chat threads are readable by community members.
drop policy if exists threads_select_own on public.threads;
create policy threads_select_own
on public.threads
for select
to authenticated
using (owner_id = auth.uid() and engine_id <> 'community_chat');

drop policy if exists threads_select_community_chat on public.threads;
create policy threads_select_community_chat
on public.threads
for select
to authenticated
using (
  engine_id = 'community_chat'
  and community_id is not null
  and exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = threads.community_id
      and cm.user_id = auth.uid()
  )
);

-- Prevent arbitrary ownership-based creation/updates/deletes for community chat threads.
drop policy if exists threads_insert_own on public.threads;
create policy threads_insert_own
on public.threads
for insert
to authenticated
with check (owner_id = auth.uid() and engine_id <> 'community_chat');

drop policy if exists threads_insert_community_chat on public.threads;
create policy threads_insert_community_chat
on public.threads
for insert
to authenticated
with check (
  engine_id = 'community_chat'
  and owner_id = auth.uid()
  and community_id is not null
  and id = community_id
  and exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = threads.community_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists threads_update_own on public.threads;
create policy threads_update_own
on public.threads
for update
to authenticated
using (owner_id = auth.uid() and engine_id <> 'community_chat')
with check (owner_id = auth.uid() and engine_id <> 'community_chat');

drop policy if exists threads_delete_own on public.threads;
create policy threads_delete_own
on public.threads
for delete
to authenticated
using (owner_id = auth.uid() and engine_id <> 'community_chat');

-- Messages: private to thread owner, except community chat messages are readable/writeable by community members.
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
      and t.engine_id <> 'community_chat'
  )
);

drop policy if exists messages_select_community_chat on public.messages;
create policy messages_select_community_chat
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.threads t
    join public.community_memberships cm on cm.community_id = t.community_id
    where t.id = messages.thread_id
      and t.engine_id = 'community_chat'
      and cm.user_id = auth.uid()
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
      and t.engine_id <> 'community_chat'
  )
);

drop policy if exists messages_insert_community_chat on public.messages;
create policy messages_insert_community_chat
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and role = 'user'
  and exists (
    select 1
    from public.threads t
    join public.community_memberships cm on cm.community_id = t.community_id
    where t.id = messages.thread_id
      and t.engine_id = 'community_chat'
      and cm.user_id = auth.uid()
  )
);

drop policy if exists messages_update_community_chat_own on public.messages;
create policy messages_update_community_chat_own
on public.messages
for update
to authenticated
using (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.threads t
    join public.community_memberships cm on cm.community_id = t.community_id
    where t.id = messages.thread_id
      and t.engine_id = 'community_chat'
      and cm.user_id = auth.uid()
  )
)
with check (
  sender_id = auth.uid()
  and role = 'user'
  and exists (
    select 1
    from public.threads t
    join public.community_memberships cm on cm.community_id = t.community_id
    where t.id = messages.thread_id
      and t.engine_id = 'community_chat'
      and cm.user_id = auth.uid()
  )
);

drop policy if exists messages_delete_community_chat_own on public.messages;
create policy messages_delete_community_chat_own
on public.messages
for delete
to authenticated
using (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.threads t
    join public.community_memberships cm on cm.community_id = t.community_id
    where t.id = messages.thread_id
      and t.engine_id = 'community_chat'
      and cm.user_id = auth.uid()
  )
);

