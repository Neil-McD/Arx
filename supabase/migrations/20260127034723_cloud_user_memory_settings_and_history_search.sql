-- User-level memory settings (cloud-canonical).
--
-- Supports ChatGPT-like companion UX:
-- - "remember ..." intent (explicit)
-- - optional memory suggestions (manual approval) or auto memory
-- - cross-thread history search (FTS v1)

create table if not exists public.user_memory_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  memory_mode text not null default 'off' check (memory_mode in ('off', 'suggest', 'auto')),
  remember_intent_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at current.
drop trigger if exists user_memory_settings_set_updated_at on public.user_memory_settings;
create trigger user_memory_settings_set_updated_at
before update on public.user_memory_settings
for each row
execute function public.set_updated_at();

alter table public.user_memory_settings enable row level security;

drop policy if exists user_memory_settings_select_own on public.user_memory_settings;
create policy user_memory_settings_select_own
on public.user_memory_settings
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists user_memory_settings_insert_own on public.user_memory_settings;
create policy user_memory_settings_insert_own
on public.user_memory_settings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_memory_settings_update_own on public.user_memory_settings;
create policy user_memory_settings_update_own
on public.user_memory_settings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_memory_settings_delete_own on public.user_memory_settings;
create policy user_memory_settings_delete_own
on public.user_memory_settings
for delete
to authenticated
using (user_id = auth.uid());

-- Cross-thread history search (FTS v1).
--
-- NOTE: This intentionally searches only the 'text'/'content' fields of content_json.
-- Attachments are excluded.
create index if not exists idx_messages_user_text_fts
  on public.messages
  using gin (to_tsvector('english', coalesce(content_json->>'text', content_json->>'content', '')))
  where role = 'user';

create or replace function public.search_user_message_snippets(
  p_user_id uuid,
  p_query text,
  p_exclude_thread_id uuid default null,
  p_limit int default 8
)
returns table (
  thread_id uuid,
  message_id uuid,
  created_at timestamptz,
  snippet text
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    m.thread_id,
    m.id as message_id,
    m.created_at,
    left(
      coalesce(m.content_json->>'text', m.content_json->>'content', ''),
      280
    ) as snippet
  from public.messages m
  join public.threads t on t.id = m.thread_id
  where t.owner_id = p_user_id
    and t.engine_id <> 'community_chat'
    and m.role = 'user'
    and (p_exclude_thread_id is null or m.thread_id <> p_exclude_thread_id)
    and to_tsvector('english', coalesce(m.content_json->>'text', m.content_json->>'content', '')) @@ plainto_tsquery('english', p_query)
  order by m.created_at desc
  limit greatest(0, least(p_limit, 20));
$$;

