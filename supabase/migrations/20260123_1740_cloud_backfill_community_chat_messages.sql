-- Backfill legacy community_chat_messages into cloud-canonical threads/messages.
--
-- Contract:
-- - Community chat uses threads/messages
-- - Chat thread id == community_id
-- - threads.engine_id = 'community_chat'

-- Safety: fail closed if any community id collides with a non-chat thread id.
do $$
begin
  if exists (
    select 1
    from public.threads t
    join public.communities c on c.id = t.id
    where t.engine_id <> 'community_chat'
  ) then
    raise exception 'community_chat_thread_id_collision';
  end if;
end $$;

-- Ensure a community chat thread exists per community.
insert into public.threads (id, owner_id, title, engine_id, model_id, community_id)
select c.id, c.owner_id, 'Community chat', 'community_chat', null, c.id
from public.communities c
where not exists (
  select 1
  from public.threads t
  where t.id = c.id
);

-- Normalize any pre-existing community chat threads to the invariant: id == community_id.
update public.threads t
set community_id = t.id,
    title = coalesce(nullif(t.title, ''), 'Community chat'),
    updated_at = now()
where t.engine_id = 'community_chat'
  and t.community_id is null
  and exists (select 1 from public.communities c where c.id = t.id);

do $$
begin
  if exists (
    select 1
    from public.threads t
    where t.engine_id = 'community_chat'
      and t.community_id is not null
      and t.id <> t.community_id
  ) then
    raise exception 'community_chat_thread_id_must_equal_community_id';
  end if;
end $$;

-- Optional backfill from legacy community_chat_messages (if present).
do $$
begin
  if to_regclass('public.community_chat_messages') is null then
    return;
  end if;

  -- Only backfill for communities that do not yet have any messages in the chat thread.
  with legacy as (
    select
      m.id,
      m.community_id as thread_id,
      row_number() over (
        partition by m.community_id
        order by m.created_at asc, m.id asc
      )::bigint as seq,
      'user'::text as role,
      jsonb_build_object('text', m.body) as content_json,
      m.sender_id,
      m.reply_to_id,
      m.created_at
    from public.community_chat_messages m
  ),
  eligible_threads as (
    select l.thread_id
    from (select distinct thread_id from legacy) l
    where not exists (select 1 from public.messages mm where mm.thread_id = l.thread_id)
  )
  insert into public.messages (id, thread_id, seq, role, content_json, sender_id, reply_to_id, created_at)
  select l.id, l.thread_id, l.seq, l.role, l.content_json, l.sender_id, l.reply_to_id, l.created_at
  from legacy l
  join eligible_threads e on e.thread_id = l.thread_id
  on conflict do nothing;
end $$;

-- Repair threads.last_seq for community chat threads (in case of legacy/partial inserts).
update public.threads t
set last_seq = m.max_seq,
    updated_at = now()
from (
  select thread_id, max(seq) as max_seq
  from public.messages
  group by thread_id
) m
where t.id = m.thread_id
  and t.engine_id = 'community_chat'
  and t.last_seq < m.max_seq;

-- Legacy mirroring is deprecated; community chat is cloud-canonical in threads/messages.
