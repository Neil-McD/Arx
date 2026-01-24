-- Tighten message_reactions RLS to require that the referenced message is actually visible
-- to the current user (same access boundary as messages).

drop policy if exists message_reactions_select_visible_message on public.message_reactions;
create policy message_reactions_select_visible_message
on public.message_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    join public.threads t on t.id = m.thread_id
    where m.id = message_reactions.message_id
      and (
        (
          t.engine_id = 'community_chat'
          and t.community_id is not null
          and public.has_active_entitlement(t.community_id)
        )
        or (
          t.engine_id <> 'community_chat'
          and t.owner_id = auth.uid()
        )
      )
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
    join public.threads t on t.id = m.thread_id
    where m.id = message_reactions.message_id
      and (
        (
          t.engine_id = 'community_chat'
          and t.community_id is not null
          and public.has_active_entitlement(t.community_id)
        )
        or (
          t.engine_id <> 'community_chat'
          and t.owner_id = auth.uid()
        )
      )
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
    join public.threads t on t.id = m.thread_id
    where m.id = message_reactions.message_id
      and (
        (
          t.engine_id = 'community_chat'
          and t.community_id is not null
          and public.has_active_entitlement(t.community_id)
        )
        or (
          t.engine_id <> 'community_chat'
          and t.owner_id = auth.uid()
        )
      )
  )
);

