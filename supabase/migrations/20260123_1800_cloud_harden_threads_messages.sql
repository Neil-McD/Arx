-- Harden cloud-canonical threads/messages invariants.
--
-- Goals:
-- - Seq is always server-assigned for user-authenticated inserts (no client seq injection).
-- - User messages always have an author (sender_id), set server-side when possible.
-- - Replies must reference a message in the same thread.
-- - Message edits cannot mutate identity/ordering fields.
-- - Community chat thread invariant: id == community_id.

-- Backfill: ensure all existing user messages have sender_id.
update public.messages m
set sender_id = t.owner_id
from public.threads t
where t.id = m.thread_id
  and m.role = 'user'
  and m.sender_id is null;

alter table public.messages
  add column if not exists edited_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_seq_positive'
  ) then
    alter table public.messages
      add constraint messages_seq_positive
      check (seq > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_user_sender_required'
  ) then
    alter table public.messages
      add constraint messages_user_sender_required
      check (role <> 'user' or sender_id is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'threads_community_chat_id_matches'
  ) then
    alter table public.threads
      add constraint threads_community_chat_id_matches
      check (
        engine_id <> 'community_chat'
        or (community_id is not null and id = community_id)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_reply_to_id_fkey'
  ) then
    alter table public.messages
      add constraint messages_reply_to_id_fkey
      foreign key (reply_to_id)
      references public.messages(id)
      on delete set null
      deferrable initially deferred;
  end if;
end $$;

-- Replies must stay within the same thread.
create or replace function public.messages_validate_reply()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reply_thread_id uuid;
begin
  if new.reply_to_id is null then
    return new;
  end if;

  select m.thread_id into v_reply_thread_id
  from public.messages m
  where m.id = new.reply_to_id;

  if v_reply_thread_id is null then
    raise exception 'reply_to_not_found';
  end if;

  if v_reply_thread_id <> new.thread_id then
    raise exception 'reply_to_thread_mismatch';
  end if;

  return new;
end $$;

drop trigger if exists trg_messages_validate_reply on public.messages;
create trigger trg_messages_validate_reply
before insert or update on public.messages
for each row execute function public.messages_validate_reply();

-- Only allow editing message content (set edited_at automatically).
create or replace function public.messages_restrict_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres') then
    if new.content_json is distinct from old.content_json then
      new.edited_at := now();
    end if;
    return new;
  end if;

  if new.thread_id <> old.thread_id
    or new.seq <> old.seq
    or new.role <> old.role
    or new.sender_id is distinct from old.sender_id
    or new.reply_to_id is distinct from old.reply_to_id
    or new.engine_id is distinct from old.engine_id
    or new.model_id is distinct from old.model_id
    or new.run_id is distinct from old.run_id
    or new.created_at <> old.created_at
  then
    raise exception 'immutable_message_fields';
  end if;

  if new.content_json is distinct from old.content_json then
    new.edited_at := now();
  end if;

  return new;
end $$;

drop trigger if exists trg_messages_restrict_update on public.messages;
create trigger trg_messages_restrict_update
before update on public.messages
for each row execute function public.messages_restrict_update();

-- Prevent client updates to threads.last_seq (seq allocator owns it).
create or replace function public.threads_restrict_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres') then
    return new;
  end if;

  if new.owner_id <> old.owner_id
    or new.engine_id <> old.engine_id
    or new.community_id is distinct from old.community_id
    or new.created_at <> old.created_at
  then
    raise exception 'immutable_thread_fields';
  end if;

  new.last_seq := old.last_seq;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_threads_restrict_update on public.threads;
create trigger trg_threads_restrict_update
before update on public.threads
for each row execute function public.threads_restrict_update();

-- Server-side seq + sender attribution. Explicit seq is only allowed when auth.uid() is null (service/backfill).
create or replace function public.messages_assign_seq()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.seq is null or new.seq = 0 or auth.uid() is not null then
    new.seq := public.next_thread_seq(new.thread_id);
  else
    update public.threads
      set last_seq = greatest(last_seq, new.seq),
          updated_at = now()
    where id = new.thread_id;
  end if;

  if new.role = 'user' then
    if auth.uid() is not null then
      new.sender_id := auth.uid();
    elsif new.sender_id is null then
      raise exception 'sender_id_required';
    end if;
  end if;

  return new;
end $$;

-- Community chat inserts should not depend on client-supplied sender_id; sender_id is assigned server-side.
drop policy if exists messages_insert_community_chat on public.messages;
create policy messages_insert_community_chat
on public.messages
for insert
to authenticated
with check (
  role = 'user'
  and exists (
    select 1
    from public.threads t
    join public.community_memberships cm on cm.community_id = t.community_id
    where t.id = messages.thread_id
      and t.engine_id = 'community_chat'
      and cm.user_id = auth.uid()
  )
);

