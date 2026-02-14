-- Community memory candidate router + promotion pipeline (v1).
--
-- Goals:
-- - Keep community harness write surface limited to governed memory proposals.
-- - Route proposals into auto-promote vs admin-review states.
-- - Preserve explicit admin promotion for queued candidates.
-- - Keep compiled community retrieval compatible by syncing promoted memory items.

create table if not exists public.community_memory_items (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  title text not null,
  content_md text not null,
  pinned boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'candidate_auto', 'candidate_admin')),
  router_signal_score integer check (router_signal_score is null or (router_signal_score between 0 and 100)),
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_doc tsvector not null default ''::tsvector
);

create index if not exists idx_community_memory_items_community_updated
  on public.community_memory_items (community_id, updated_at desc);
create index if not exists idx_community_memory_items_community_created
  on public.community_memory_items (community_id, created_at desc);
create index if not exists idx_community_memory_items_search_doc
  on public.community_memory_items
  using gin (search_doc);

create table if not exists public.community_memory_candidates (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  proposer_user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  memory_text text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  request_key text,
  router_state text not null default 'queued' check (
    router_state in ('queued', 'needs_review', 'auto_promoted', 'admin_promoted', 'rejected')
  ),
  signal_score integer not null default 0 check (signal_score between 0 and 100),
  router_reason text,
  promoted_memory_id uuid references public.community_memory_items(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_community_memory_candidates_request
  on public.community_memory_candidates (community_id, proposer_user_id, request_key)
  where request_key is not null;
create index if not exists idx_community_memory_candidates_community_state
  on public.community_memory_candidates (community_id, router_state, created_at desc);
create index if not exists idx_community_memory_candidates_proposer
  on public.community_memory_candidates (proposer_user_id, created_at desc);

alter table public.community_memory_items
  add column if not exists source_candidate_id uuid references public.community_memory_candidates(id) on delete set null;

create or replace function public.community_memory_build_search_doc(
  p_title text,
  p_content_md text
)
returns tsvector
language sql
stable
set search_path = public
as $$
  select to_tsvector('english', coalesce(p_title, '') || ' ' || coalesce(p_content_md, ''));
$$;

create or replace function public.community_memory_set_derived_fields()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  new.updated_at := now();
  new.search_doc := public.community_memory_build_search_doc(new.title, new.content_md);
  return new;
end;
$$;

drop trigger if exists trg_community_memory_items_derived_fields on public.community_memory_items;
create trigger trg_community_memory_items_derived_fields
before insert or update on public.community_memory_items
for each row
execute function public.community_memory_set_derived_fields();

create or replace function public.community_memory_candidates_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_community_memory_candidates_updated_at on public.community_memory_candidates;
create trigger trg_community_memory_candidates_updated_at
before update on public.community_memory_candidates
for each row
execute function public.community_memory_candidates_set_updated_at();

create or replace function public.derive_community_memory_title(
  p_title text,
  p_memory_text text
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_fallback text;
begin
  if v_title is not null then
    return left(v_title, 160);
  end if;

  v_fallback := regexp_replace(btrim(coalesce(p_memory_text, '')), '\\s+', ' ', 'g');
  if v_fallback = '' then
    return 'Community memory';
  end if;

  return left(v_fallback, 160);
end;
$$;

create or replace function public.route_community_memory_candidate(
  p_memory_text text
)
returns table(
  router_state text,
  signal_score integer,
  router_reason text
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_text text := btrim(coalesce(p_memory_text, ''));
  v_lower text;
  v_word_count integer := 0;
begin
  if v_text = '' then
    return query select 'rejected'::text, 0::integer, 'empty_candidate'::text;
    return;
  end if;

  v_lower := lower(v_text);
  v_word_count := coalesce(array_length(regexp_split_to_array(v_text, '\\s+'), 1), 0);

  if v_lower ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}'
     or v_lower ~* '(^|[^a-z])(sk-[a-z0-9]{12,}|api[_-]?key|access[_-]?token|password|secret)([^a-z]|$)'
  then
    return query select 'rejected'::text, 5::integer, 'sensitive_pattern'::text;
    return;
  end if;

  if char_length(v_text) < 80 or v_word_count < 12 then
    return query select 'needs_review'::text, 45::integer, 'low_signal'::text;
    return;
  end if;

  if char_length(v_text) >= 240 and v_word_count >= 28 then
    return query select 'auto_promoted'::text, 88::integer, 'high_signal_auto_promote'::text;
    return;
  end if;

  return query select 'needs_review'::text, 68::integer, 'requires_admin_review'::text;
end;
$$;

create or replace function public.community_memory_candidate_propose(
  p_community_id uuid,
  p_title text default null,
  p_memory_text text default null,
  p_evidence jsonb default null,
  p_request_key text default null
)
returns table(
  candidate_id uuid,
  router_state text,
  signal_score integer,
  router_reason text,
  promoted_memory_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_memory_text text := nullif(btrim(coalesce(p_memory_text, '')), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_evidence jsonb := coalesce(p_evidence, '{}'::jsonb);
  v_request_key text := nullif(btrim(coalesce(p_request_key, '')), '');
  v_router_state text;
  v_signal_score integer;
  v_router_reason text;
  v_candidate_id uuid;
  v_created_at timestamptz;
  v_promoted_memory_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;
  if v_memory_text is null then
    raise exception 'memory_text is required' using errcode = '22023';
  end if;
  if jsonb_typeof(v_evidence) is distinct from 'object' then
    raise exception 'evidence must be an object' using errcode = '22023';
  end if;

  if not public.has_active_entitlement(p_community_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_request_key is not null then
    select c.id, c.router_state, c.signal_score, c.router_reason, c.promoted_memory_id, c.created_at
      into v_candidate_id, v_router_state, v_signal_score, v_router_reason, v_promoted_memory_id, v_created_at
      from public.community_memory_candidates c
     where c.community_id = p_community_id
       and c.proposer_user_id = v_user_id
       and c.request_key = v_request_key
     order by c.created_at desc
     limit 1;

    if v_candidate_id is not null then
      return query
      select v_candidate_id, v_router_state, v_signal_score, v_router_reason, v_promoted_memory_id, v_created_at;
      return;
    end if;
  end if;

  select d.router_state, d.signal_score, d.router_reason
    into v_router_state, v_signal_score, v_router_reason
    from public.route_community_memory_candidate(v_memory_text) d
   limit 1;

  insert into public.community_memory_candidates(
    community_id,
    proposer_user_id,
    title,
    memory_text,
    evidence_json,
    request_key,
    router_state,
    signal_score,
    router_reason
  )
  values (
    p_community_id,
    v_user_id,
    v_title,
    v_memory_text,
    v_evidence,
    v_request_key,
    v_router_state,
    coalesce(v_signal_score, 0),
    v_router_reason
  )
  returning id, created_at into v_candidate_id, v_created_at;

  if v_router_state = 'auto_promoted' then
    insert into public.community_memory_items(
      community_id,
      title,
      content_md,
      pinned,
      source,
      source_candidate_id,
      router_signal_score,
      metadata_json,
      created_by
    )
    values (
      p_community_id,
      public.derive_community_memory_title(v_title, v_memory_text),
      v_memory_text,
      false,
      'candidate_auto',
      v_candidate_id,
      v_signal_score,
      jsonb_build_object(
        'router_reason', v_router_reason,
        'evidence', v_evidence,
        'source', 'community_memory_candidate_propose'
      ),
      v_user_id
    )
    returning id into v_promoted_memory_id;

    update public.community_memory_candidates
       set promoted_memory_id = v_promoted_memory_id,
           reviewed_by = v_user_id,
           reviewed_at = now(),
           updated_at = now()
     where id = v_candidate_id;
  end if;

  return query
  select v_candidate_id, v_router_state, coalesce(v_signal_score, 0), v_router_reason, v_promoted_memory_id, v_created_at;
end;
$$;

create or replace function public.community_memory_candidate_promote(
  p_candidate_id uuid,
  p_title text default null
)
returns table(
  candidate_id uuid,
  memory_id uuid,
  promoted_at timestamptz,
  router_state text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_candidate public.community_memory_candidates%rowtype;
  v_memory_id uuid;
  v_promoted_at timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_candidate_id is null then
    raise exception 'candidate_id is required' using errcode = '22023';
  end if;

  select *
    into v_candidate
    from public.community_memory_candidates c
   where c.id = p_candidate_id
   limit 1;

  if v_candidate.id is null then
    raise exception 'candidate_not_found' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(v_candidate.community_id, array['owner','admin','mod']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_candidate.promoted_memory_id is not null then
    select m.created_at into v_promoted_at
      from public.community_memory_items m
     where m.id = v_candidate.promoted_memory_id;

    return query
    select v_candidate.id, v_candidate.promoted_memory_id, coalesce(v_promoted_at, now()), v_candidate.router_state;
    return;
  end if;

  insert into public.community_memory_items(
    community_id,
    title,
    content_md,
    pinned,
    source,
    source_candidate_id,
    router_signal_score,
    metadata_json,
    created_by
  )
  values (
    v_candidate.community_id,
    public.derive_community_memory_title(coalesce(nullif(btrim(coalesce(p_title, '')), ''), v_candidate.title), v_candidate.memory_text),
    v_candidate.memory_text,
    false,
    'candidate_admin',
    v_candidate.id,
    v_candidate.signal_score,
    jsonb_build_object(
      'router_reason', coalesce(v_candidate.router_reason, 'admin_promoted'),
      'evidence', coalesce(v_candidate.evidence_json, '{}'::jsonb),
      'source', 'community_memory_candidate_promote'
    ),
    v_user_id
  )
  returning id, created_at into v_memory_id, v_promoted_at;

  update public.community_memory_candidates
     set router_state = 'admin_promoted',
         promoted_memory_id = v_memory_id,
         reviewed_by = v_user_id,
         reviewed_at = now(),
         updated_at = now()
   where id = v_candidate.id;

  return query select v_candidate.id, v_memory_id, v_promoted_at, 'admin_promoted'::text;
end;
$$;

create or replace function public.search_community_memory_items(
  p_user_id uuid,
  p_community_id uuid,
  p_query text,
  p_limit int default 8
)
returns table(
  memory_id uuid,
  community_id uuid,
  title text,
  snippet text,
  source text,
  created_at timestamptz,
  updated_at timestamptz,
  score real
)
language sql
security definer
set search_path = public
set row_security = off
as $$
  with params as (
    select
      left(btrim(coalesce(p_query, '')), 240) as query_text,
      greatest(1, least(coalesce(p_limit, 8), 12)) as lim
  ),
  qry as (
    select
      case
        when query_text = '' then null::tsquery
        else websearch_to_tsquery('english', query_text)
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
  )
  select
    m.id as memory_id,
    m.community_id,
    m.title,
    left(btrim(coalesce(m.content_md, '')), 320) as snippet,
    m.source,
    m.created_at,
    m.updated_at,
    case
      when q.tsq is null then 0::real
      else ts_rank_cd(m.search_doc, q.tsq)
    end as score
  from public.community_memory_items m
  cross join qry q
  cross join authz a
  where a.caller_ok
    and a.entitled
    and m.community_id = p_community_id
    and (q.tsq is null or m.search_doc @@ q.tsq)
  order by
    case
      when q.tsq is null then case when m.pinned then 1 else 0 end
      else ts_rank_cd(m.search_doc, q.tsq)
    end desc,
    m.updated_at desc
  limit (select lim from qry);
$$;

alter table public.community_memory_items enable row level security;
alter table public.community_memory_candidates enable row level security;

drop policy if exists community_memory_items_select_member on public.community_memory_items;
create policy community_memory_items_select_member
on public.community_memory_items
for select
using (
  public.is_community_member(community_id)
  or public.has_active_entitlement(community_id)
);

drop policy if exists community_memory_items_write_admin on public.community_memory_items;
create policy community_memory_items_write_admin
on public.community_memory_items
for insert
with check (public.has_active_entitlement_role(community_id, array['owner','admin','mod']));

drop policy if exists community_memory_items_update_admin on public.community_memory_items;
create policy community_memory_items_update_admin
on public.community_memory_items
for update
using (public.has_active_entitlement_role(community_id, array['owner','admin','mod']))
with check (public.has_active_entitlement_role(community_id, array['owner','admin','mod']));

drop policy if exists community_memory_items_delete_admin on public.community_memory_items;
create policy community_memory_items_delete_admin
on public.community_memory_items
for delete
using (public.has_active_entitlement_role(community_id, array['owner','admin','mod']));

drop policy if exists community_memory_candidates_select_owner_or_admin on public.community_memory_candidates;
create policy community_memory_candidates_select_owner_or_admin
on public.community_memory_candidates
for select
using (
  proposer_user_id = auth.uid()
  or public.has_active_entitlement_role(community_id, array['owner','admin','mod'])
);

drop policy if exists community_memory_candidates_insert_member on public.community_memory_candidates;
create policy community_memory_candidates_insert_member
on public.community_memory_candidates
for insert
with check (
  proposer_user_id = auth.uid()
  and public.has_active_entitlement(community_id)
);

drop policy if exists community_memory_candidates_update_admin on public.community_memory_candidates;
create policy community_memory_candidates_update_admin
on public.community_memory_candidates
for update
using (public.has_active_entitlement_role(community_id, array['owner','admin','mod']))
with check (public.has_active_entitlement_role(community_id, array['owner','admin','mod']));

-- Extend compiled context to ingest promoted community memory items.
do $$
begin
  if to_regclass('public.community_context_state') is not null then
    alter table public.community_context_state
      add column if not exists memory_count integer not null default 0;
  end if;
end;
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
  v_memory_count integer := 0;
begin
  if p_community_id is null then
    return;
  end if;

  select
    count(*) filter (where source_type = 'chat_message')::integer,
    count(*) filter (where source_type = 'community_resource')::integer,
    count(*) filter (where source_type = 'community_memory')::integer
  into v_chat_count, v_resource_count, v_memory_count
  from public.community_context_items
  where community_id = p_community_id;

  insert into public.community_context_state (
    community_id,
    compile_version,
    last_compiled_at,
    last_error,
    chat_count,
    resource_count,
    memory_count
  )
  values (
    p_community_id,
    1,
    now(),
    null,
    v_chat_count,
    v_resource_count,
    v_memory_count
  )
  on conflict (community_id)
  do update set
    compile_version = public.community_context_state.compile_version + 1,
    last_compiled_at = now(),
    last_error = null,
    chat_count = excluded.chat_count,
    resource_count = excluded.resource_count,
    memory_count = excluded.memory_count;
end;
$$;

do $$
begin
  if to_regclass('public.community_context_items') is null then
    return;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.community_context_items'::regclass
      and conname = 'community_context_items_source_type_check'
  ) then
    alter table public.community_context_items
      drop constraint community_context_items_source_type_check;
  end if;

  alter table public.community_context_items
    add constraint community_context_items_source_type_check
      check (source_type in ('chat_message', 'community_resource', 'community_memory'));
end;
$$;

create or replace function public.sync_community_context_from_memory_item()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_existing_community_id uuid;
  v_target_community_id uuid;
  v_snippet text;
begin
  if tg_op <> 'INSERT' then
    select i.community_id
      into v_existing_community_id
      from public.community_context_items i
     where i.source_type = 'community_memory'
       and i.source_id = coalesce(new.id, old.id)
     limit 1;
  end if;

  if tg_op = 'DELETE' then
    delete from public.community_context_items
     where source_type = 'community_memory'
       and source_id = old.id;

    if v_existing_community_id is not null then
      perform public.bump_community_context_state(v_existing_community_id);
    end if;

    return old;
  end if;

  v_target_community_id := new.community_id;
  v_snippet := left(
    btrim(coalesce(nullif(new.content_md, ''), nullif(new.title, ''), '')),
    320
  );

  if v_target_community_id is null or v_snippet = '' then
    delete from public.community_context_items
     where source_type = 'community_memory'
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
    'community_memory',
    new.id,
    v_target_community_id,
    null,
    new.created_by,
    null,
    nullif(btrim(coalesce(new.title, '')), ''),
    v_snippet,
    null,
    coalesce(new.pinned, false),
    new.created_at,
    coalesce(new.updated_at, new.created_at, now()),
    public.community_context_build_search_doc(new.title, v_snippet, null),
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

drop trigger if exists trg_sync_community_context_memory_items on public.community_memory_items;
create trigger trg_sync_community_context_memory_items
after insert or update or delete on public.community_memory_items
for each row
execute function public.sync_community_context_from_memory_item();

revoke all on function public.community_memory_candidate_propose(uuid, text, text, jsonb, text) from public;
revoke all on function public.community_memory_candidate_propose(uuid, text, text, jsonb, text) from anon;
revoke all on function public.community_memory_candidate_propose(uuid, text, text, jsonb, text) from authenticated;
revoke all on function public.community_memory_candidate_propose(uuid, text, text, jsonb, text) from service_role;
grant execute on function public.community_memory_candidate_propose(uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.community_memory_candidate_propose(uuid, text, text, jsonb, text) to service_role;

revoke all on function public.community_memory_candidate_promote(uuid, text) from public;
revoke all on function public.community_memory_candidate_promote(uuid, text) from anon;
revoke all on function public.community_memory_candidate_promote(uuid, text) from authenticated;
revoke all on function public.community_memory_candidate_promote(uuid, text) from service_role;
grant execute on function public.community_memory_candidate_promote(uuid, text) to authenticated;
grant execute on function public.community_memory_candidate_promote(uuid, text) to service_role;

revoke all on function public.search_community_memory_items(uuid, uuid, text, int) from public;
revoke all on function public.search_community_memory_items(uuid, uuid, text, int) from anon;
revoke all on function public.search_community_memory_items(uuid, uuid, text, int) from authenticated;
revoke all on function public.search_community_memory_items(uuid, uuid, text, int) from service_role;
grant execute on function public.search_community_memory_items(uuid, uuid, text, int) to authenticated;
grant execute on function public.search_community_memory_items(uuid, uuid, text, int) to service_role;
