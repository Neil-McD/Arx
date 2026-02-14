-- Community retrieval RPCs for AI-first grounding.
--
-- Goals:
-- - Keep retrieval deterministic and bounded.
-- - Let authenticated users query only their own community context.
-- - Allow server-side service_role calls for edge-function orchestration.

create index if not exists idx_threads_community_engine_id
  on public.threads (community_id, engine_id, id);

create index if not exists idx_messages_role_thread_created
  on public.messages (role, thread_id, created_at desc);

create index if not exists idx_messages_text_fts_agent_retrieval
  on public.messages
  using gin (to_tsvector('english', coalesce(content_json->>'text', content_json->>'content', '')))
  where role in ('user', 'assistant');

create index if not exists idx_community_resources_text_fts
  on public.community_resources
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body_md, '') || ' ' || coalesce(url, '')));

create or replace function public.search_community_chat_snippets(
  p_user_id uuid,
  p_community_id uuid,
  p_query text default null,
  p_limit int default 8
)
returns table (
  thread_id uuid,
  message_id uuid,
  sender_id uuid,
  sender_display text,
  created_at timestamptz,
  snippet text
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
      greatest(0, least(coalesce(p_limit, 8), 20)) as lim
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
  base as (
    select
      m.thread_id,
      m.id as message_id,
      m.sender_id,
      coalesce(nullif(trim(pr.display_name), ''), 'member') as sender_display,
      m.created_at,
      left(coalesce(m.content_json->>'text', m.content_json->>'content', ''), 320) as snippet,
      to_tsvector('english', coalesce(m.content_json->>'text', m.content_json->>'content', '')) as document
    from public.messages m
    join public.threads t on t.id = m.thread_id
    left join public.profiles pr on pr.user_id = m.sender_id
    where t.community_id = p_community_id
      and t.engine_id = 'community_chat'
      and m.role in ('user', 'assistant')
      and coalesce(m.content_json->>'text', m.content_json->>'content', '') <> ''
  )
  select
    b.thread_id,
    b.message_id,
    b.sender_id,
    b.sender_display,
    b.created_at,
    b.snippet
  from base b
  cross join authz a
  cross join qry q
  where a.caller_ok
    and a.entitled
    and (q.tsq is null or b.document @@ q.tsq)
  order by
    case
      when q.tsq is null then 0
      else ts_rank_cd(b.document, q.tsq)
    end desc,
    b.created_at desc
  limit (select lim from qry);
$$;

create or replace function public.search_community_resource_snippets(
  p_user_id uuid,
  p_community_id uuid,
  p_query text default null,
  p_limit int default 6
)
returns table (
  resource_id uuid,
  resource_type text,
  title text,
  created_at timestamptz,
  pinned boolean,
  snippet text,
  url text,
  file_key text
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
      greatest(0, least(coalesce(p_limit, 6), 20)) as lim
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
  base as (
    select
      cr.id as resource_id,
      cr.type as resource_type,
      cr.title,
      cr.created_at,
      cr.pinned,
      left(
        coalesce(nullif(cr.body_md, ''), nullif(cr.url, ''), cr.title, ''),
        320
      ) as snippet,
      cr.url,
      cr.file_key,
      to_tsvector('english', coalesce(cr.title, '') || ' ' || coalesce(cr.body_md, '') || ' ' || coalesce(cr.url, '')) as document
    from public.community_resources cr
    where cr.community_id = p_community_id
  )
  select
    b.resource_id,
    b.resource_type,
    b.title,
    b.created_at,
    b.pinned,
    b.snippet,
    b.url,
    b.file_key
  from base b
  cross join authz a
  cross join qry q
  where a.caller_ok
    and a.entitled
    and (q.tsq is null or b.document @@ q.tsq)
  order by
    case
      when q.tsq is null then case when b.pinned then 1 else 0 end
      else ts_rank_cd(b.document, q.tsq)
    end desc,
    b.created_at desc
  limit (select lim from qry);
$$;

revoke all on function public.search_community_chat_snippets(uuid, uuid, text, integer) from public;
revoke all on function public.search_community_chat_snippets(uuid, uuid, text, integer) from anon;
revoke all on function public.search_community_chat_snippets(uuid, uuid, text, integer) from authenticated;
revoke all on function public.search_community_chat_snippets(uuid, uuid, text, integer) from service_role;
grant execute on function public.search_community_chat_snippets(uuid, uuid, text, integer) to authenticated;
grant execute on function public.search_community_chat_snippets(uuid, uuid, text, integer) to service_role;

revoke all on function public.search_community_resource_snippets(uuid, uuid, text, integer) from public;
revoke all on function public.search_community_resource_snippets(uuid, uuid, text, integer) from anon;
revoke all on function public.search_community_resource_snippets(uuid, uuid, text, integer) from authenticated;
revoke all on function public.search_community_resource_snippets(uuid, uuid, text, integer) from service_role;
grant execute on function public.search_community_resource_snippets(uuid, uuid, text, integer) to authenticated;
grant execute on function public.search_community_resource_snippets(uuid, uuid, text, integer) to service_role;
