-- Enforce correct attribution for community chat messages.
-- Clients should not be able to spoof `sender_id`.

alter table public.messages
  alter column sender_id set default auth.uid();

drop policy if exists messages_insert_community_chat on public.messages;
create policy messages_insert_community_chat
  on public.messages
  for insert
  to authenticated
  with check (
    role = 'user'
    and sender_id = auth.uid()
    and exists (
      select 1
      from public.threads t
      where t.id = messages.thread_id
        and t.engine_id = 'community_chat'
        and t.community_id is not null
        and public.has_active_entitlement(t.community_id)
    )
  );

