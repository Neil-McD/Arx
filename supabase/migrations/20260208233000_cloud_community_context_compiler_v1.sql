-- Community Context Compiler v1
--
-- MVP goals:
-- - Compile community chat/resource snippets into a single bounded artifact table.
-- - Keep compile state/version per community.
-- - Serve retrieval through one RPC with authz checks.
-- - Keep existing retrieval RPCs as fallback compatibility.

create table if not exists public.community_context_items (
  source_type text not null check (source_type in ('chat_message', 'community_resource')),
  source_id uuid not null,
  community_id uuid not null references public.communities(id) on delete cascade,
  thread_id uuid,
  sender_id uuid,
  sender_display text,
  title text,
  snippet text not null,
  url text,
  pinned boolean not null default false,
  source_created_at timestamptz,
  source_updated_at timestamptz not null default now(),
  search_doc tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_type, source_id)
);
create index if not exists idx_community_context_items_community_updated
  on public.community_context_items (community_id, source_updated_at desc);
create index if not exists idx_community_context_items_community_type_updated
  on public.community_context_items (community_id, source_type, source_updated_at desc);
create index if not exists idx_community_context_items_search_doc
  on public.community_context_items
  using gin (search_doc);
create table if not exists public.community_context_state (
  community_id uuid primary key references public.communities(id) on delete cascade,
  compile_version bigint not null default 0,
  last_compiled_at timestamptz,
  last_error text,
  chat_count integer not null default 0,
  resource_count integer not null default 0
);
create or replace function public.community_context_build_search_doc(
  p_title text,
  p_snippet text,
  p_url text
)
returns tsvector
language sql
stable
set search_path = public
as $$
  select to_tsvector(
    'english',
    coalesce(p_title, '') || ' ' || coalesce(p_snippet, '') || ' ' || coalesce(p_url, '')
  );
$$;
create or replace function public.bump_community_context_state(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_chat_count integer := 0;
  v_resource_count integer := 0;
begin
  if p_community_id is null then
    return;
  end if;

  select
    count(*) filter (where source_type = 'chat_message')::integer,
    count(*) filter (where source_type = 'community_resource')::integer
  into v_chat_count, v_resource_count
  from public.community_context_items
  where community_id = p_community_id;

  insert into public.community_context_state (
    community_id,
    compile_version,
    last_compiled_at,
    last_error,
    chat_count,
    resource_count
  )
  values (
    p_community_id,
    1,
    now(),
    null,
    v_chat_count,
    v_resource_count
  )
  on conflict (community_id)
  do update set
    compile_version = public.community_context_state.compile_version + 1,
    last_compiled_at = now(),
    last_error = null,
    chat_count = excluded.chat_count,
    resource_count = excluded.resource_count;
end;
$$;
create or replace function public.sync_community_context_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_existing_community_id uuid;
  v_target_community_id uuid;
  v_sender_display text;
  v_snippet text;
begin
  if tg_op <> 'INSERT' then
    select i.community_id
      into v_existing_community_id
      from public.community_context_items i
     where i.source_type = 'chat_message'
       and i.source_id = coalesce(new.id, old.id)
     limit 1;
  end if;

  if tg_op = 'DELETE' then
    delete from public.community_context_items
     where source_type = 'chat_message'
       and source_id = old.id;
    if v_existing_community_id is not null then
      perform public.bump_community_context_state(v_existing_community_id);
    end if;
    return old;
  end if;

  select t.community_id
    into v_target_community_id
    from public.threads t
   where t.id = new.thread_id
     and t.engine_id = 'community_chat'
     and t.community_id is not null
   limit 1;

  v_snippet := left(btrim(coalesce(new.content_json->>'text', new.content_json->>'content', '')), 320);

  if v_target_community_id is null
     or new.role not in ('user', 'assistant')
     or v_snippet = '' then
    delete from public.community_context_items
     where source_type = 'chat_message'
       and source_id = new.id;
    if v_existing_community_id is not null then
      perform public.bump_community_context_state(v_existing_community_id);
    end if;
    return new;
  end if;

  select coalesce(nullif(btrim(pr.display_name), ''), 'member')
    into v_sender_display
    from public.profiles pr
   where pr.user_id = new.sender_id
   limit 1;
  v_sender_display := coalesce(v_sender_display, 'member');

  insert into public.community_context_items (
    source_type,
    source_id,
    community_id,
    thread_id,
    sender_id,
    sender_display,
    title,
    snippet,
    url,
    pinned,
    source_created_at,
    source_updated_at,
    search_doc,
    updated_at
  )
  values (
    'chat_message',
    new.id,
    v_target_community_id,
    new.thread_id,
    new.sender_id,
    v_sender_display,
    null,
    v_snippet,
    null,
    false,
    new.created_at,
    coalesce(new.edited_at, new.created_at, now()),
    public.community_context_build_search_doc(null, v_snippet, null),
    now()
  )
  on conflict (source_type, source_id)
  do update set
    community_id = excluded.community_id,
    thread_id = excluded.thread_id,
    sender_id = excluded.sender_id,
    sender_display = excluded.sender_display,
    title = excluded.title,
    snippet = excluded.snippet,
    url = excluded.url,
    pinned = excluded.pinned,
    source_created_at = excluded.source_created_at,
    source_updated_at = excluded.source_updated_at,
    search_doc = excluded.search_doc,
    updated_at = now();

  perform public.bump_community_context_state(v_target_community_id);
  if v_existing_community_id is not null and v_existing_community_id <> v_target_community_id then
    perform public.bump_community_context_state(v_existing_community_id);
  end if;

  return new;
end;
$$;
create or replace function public.sync_community_context_from_resource()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_existing_community_id uuid;
  v_snippet text;
begin
  if tg_op <> 'INSERT' then
    select i.community_id
      into v_existing_community_id
      from public.community_context_items i
     where i.source_type = 'community_resource'
       and i.source_id = coalesce(new.id, old.id)
     limit 1;
  end if;

  if tg_op = 'DELETE' then
    delete from public.community_context_items
     where source_type = 'community_resource'
       and source_id = old.id;
    if v_existing_community_id is not null then
      perform public.bump_community_context_state(v_existing_community_id);
    end if;
    return old;
  end if;

  v_snippet := left(
    btrim(coalesce(nullif(new.body_md, ''), nullif(new.url, ''), nullif(new.title, ''), '')),
    320
  );

  if new.community_id is null or v_snippet = '' then
    delete from public.community_context_items
     where source_type = 'community_resource'
       and source_id = new.id;
    if v_existing_community_id is not null then
      perform public.bump_community_context_state(v_existing_community_id);
    end if;
    return new;
  end if;

  insert into public.community_context_items (
    source_type,
    source_id,
    community_id,
    title,
    snippet,
    url,
    pinned,
    source_created_at,
    source_updated_at,
    search_doc,
    updated_at
  )
  values (
    'community_resource',
    new.id,
    new.community_id,
    left(coalesce(new.title, ''), 100),
    v_snippet,
    nullif(btrim(coalesce(new.url, '')), ''),
    coalesce(new.pinned, false),
    new.created_at,
    now(),
    public.community_context_build_search_doc(new.title, v_snippet, new.url),
    now()
  )
  on conflict (source_type, source_id)
  do update set
    community_id = excluded.community_id,
    title = excluded.title,
    snippet = excluded.snippet,
    url = excluded.url,
    pinned = excluded.pinned,
    source_created_at = excluded.source_created_at,
    source_updated_at = excluded.source_updated_at,
    search_doc = excluded.search_doc,
    updated_at = now();

  perform public.bump_community_context_state(new.community_id);
  if v_existing_community_id is not null and v_existing_community_id <> new.community_id then
    perform public.bump_community_context_state(v_existing_community_id);
  end if;

  return new;
end;
$$;
-- One-time compile/backfill from existing community chat and resources.
insert into public.community_context_items (
  source_type,
  source_id,
  community_id,
  thread_id,
  sender_id,
  sender_display,
  title,
  snippet,
  url,
  pinned,
  source_created_at,
  source_updated_at,
  search_doc,
  created_at,
  updated_at
)
select
  'chat_message',
  m.id,
  t.community_id,
  m.thread_id,
  m.sender_id,
  coalesce(nullif(btrim(pr.display_name), ''), 'member'),
  null,
  left(btrim(coalesce(m.content_json->>'text', m.content_json->>'content', '')), 320),
  null,
  false,
  m.created_at,
  coalesce(m.edited_at, m.created_at, now()),
  public.community_context_build_search_doc(
    null,
    left(btrim(coalesce(m.content_json->>'text', m.content_json->>'content', '')), 320),
    null
  ),
  now(),
  now()
from public.messages m
join public.threads t on t.id = m.thread_id
left join public.profiles pr on pr.user_id = m.sender_id
where t.engine_id = 'community_chat'
  and t.community_id is not null
  and m.role in ('user', 'assistant')
  and left(btrim(coalesce(m.content_json->>'text', m.content_json->>'content', '')), 320) <> ''
on conflict (source_type, source_id)
do update set
  community_id = excluded.community_id,
  thread_id = excluded.thread_id,
  sender_id = excluded.sender_id,
  sender_display = excluded.sender_display,
  title = excluded.title,
  snippet = excluded.snippet,
  url = excluded.url,
  pinned = excluded.pinned,
  source_created_at = excluded.source_created_at,
  source_updated_at = excluded.source_updated_at,
  search_doc = excluded.search_doc,
  updated_at = now();
insert into public.community_context_items (
  source_type,
  source_id,
  community_id,
  title,
  snippet,
  url,
  pinned,
  source_created_at,
  source_updated_at,
  search_doc,
  created_at,
  updated_at
)
select
  'community_resource',
  cr.id,
  cr.community_id,
  left(coalesce(cr.title, ''), 100),
  left(btrim(coalesce(nullif(cr.body_md, ''), nullif(cr.url, ''), nullif(cr.title, ''), '')), 320),
  nullif(btrim(coalesce(cr.url, '')), ''),
  coalesce(cr.pinned, false),
  cr.created_at,
  now(),
  public.community_context_build_search_doc(
    cr.title,
    left(btrim(coalesce(nullif(cr.body_md, ''), nullif(cr.url, ''), nullif(cr.title, ''), '')), 320),
    cr.url
  ),
  now(),
  now()
from public.community_resources cr
where cr.community_id is not null
  and left(btrim(coalesce(nullif(cr.body_md, ''), nullif(cr.url, ''), nullif(cr.title, ''), '')), 320) <> ''
on conflict (source_type, source_id)
do update set
  community_id = excluded.community_id,
  title = excluded.title,
  snippet = excluded.snippet,
  url = excluded.url,
  pinned = excluded.pinned,
  source_created_at = excluded.source_created_at,
  source_updated_at = excluded.source_updated_at,
  search_doc = excluded.search_doc,
  updated_at = now();
insert into public.community_context_state (
  community_id,
  compile_version,
  last_compiled_at,
  last_error,
  chat_count,
  resource_count
)
select
  i.community_id,
  1,
  now(),
  null,
  count(*) filter (where i.source_type = 'chat_message')::integer,
  count(*) filter (where i.source_type = 'community_resource')::integer
from public.community_context_items i
group by i.community_id
on conflict (community_id)
do update set
  compile_version = greatest(public.community_context_state.compile_version, 1),
  last_compiled_at = now(),
  last_error = null,
  chat_count = excluded.chat_count,
  resource_count = excluded.resource_count;
drop trigger if exists trg_sync_community_context_messages on public.messages;
create trigger trg_sync_community_context_messages
after insert or update or delete on public.messages
for each row
execute function public.sync_community_context_from_message();
drop trigger if exists trg_sync_community_context_resources on public.community_resources;
create trigger trg_sync_community_context_resources
after insert or update or delete on public.community_resources
for each row
execute function public.sync_community_context_from_resource();
create or replace function public.search_compiled_community_context(
  p_user_id uuid,
  p_community_id uuid,
  p_query text default null,
  p_limit int default 12
)
returns table (
  community_id uuid,
  source_type text,
  source_id uuid,
  thread_id uuid,
  sender_id uuid,
  sender_display text,
  title text,
  snippet text,
  url text,
  pinned boolean,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  rank_score real,
  compile_version bigint
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with params as (
    select
      nullif(trim(coalesce(p_query, '')), '') as q,
      greatest(0, least(coalesce(p_limit, 12), 40)) as lim
  ),
  qry as (
    select
      case
        when q is not null and char_length(q) >= 3 then plainto_tsquery('english', q)
        else null
      end as tsq,
      lim
    from params
  ),
  authz as (
    select
      ((auth.uid() is null) or auth.uid() = p_user_id) as caller_ok,
      (
        exists (
          select 1
          from public.community_memberships cm
          where cm.community_id = p_community_id
            and cm.user_id = p_user_id
        )
        or coalesce(public.user_has_active_entitlement(p_user_id, p_community_id), false)
      ) as entitled
  ),
  state_row as (
    select coalesce(s.compile_version, 0) as compile_version
    from public.community_context_state s
    where s.community_id = p_community_id
    limit 1
  ),
  ranked as (
    select
      i.community_id,
      i.source_type,
      i.source_id,
      i.thread_id,
      i.sender_id,
      i.sender_display,
      i.title,
      i.snippet,
      i.url,
      i.pinned,
      i.source_created_at,
      i.source_updated_at,
      case
        when q.tsq is null then 0::real
        else ts_rank_cd(i.search_doc, q.tsq)
      end as rank_score
    from public.community_context_items i
    cross join qry q
    where i.community_id = p_community_id
      and (q.tsq is null or i.search_doc @@ q.tsq)
  )
  select
    r.community_id,
    r.source_type,
    r.source_id,
    r.thread_id,
    r.sender_id,
    r.sender_display,
    r.title,
    r.snippet,
    r.url,
    r.pinned,
    r.source_created_at,
    r.source_updated_at,
    r.rank_score,
    coalesce((select compile_version from state_row), 0) as compile_version
  from ranked r
  cross join authz a
  cross join qry q
  where a.caller_ok
    and a.entitled
  order by
    case
      when q.tsq is null then case when r.pinned then 1 else 0 end
      else r.rank_score
    end desc,
    r.source_updated_at desc
  limit (select lim from qry);
$$;
revoke all on function public.search_compiled_community_context(uuid, uuid, text, int) from public;
revoke all on function public.search_compiled_community_context(uuid, uuid, text, int) from anon;
revoke all on function public.search_compiled_community_context(uuid, uuid, text, int) from authenticated;
revoke all on function public.search_compiled_community_context(uuid, uuid, text, int) from service_role;
grant execute on function public.search_compiled_community_context(uuid, uuid, text, int) to authenticated;
grant execute on function public.search_compiled_community_context(uuid, uuid, text, int) to service_role;
