-- Cloud thread context contract parity with desktop:
-- - thread_lane/project_id/community_id/context_version live on threads
-- - context mutations go through an optimistic RPC

alter table public.threads
  add column if not exists thread_lane text not null default 'chat',
  add column if not exists project_id text,
  add column if not exists context_version bigint not null default 0;

update public.threads
set thread_lane = 'chat'
where thread_lane is null
   or btrim(thread_lane) = ''
   or lower(btrim(thread_lane)) not in ('chat', 'agent');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'threads_thread_lane_valid'
  ) then
    alter table public.threads
      add constraint threads_thread_lane_valid
      check (thread_lane in ('chat', 'agent'));
  end if;
end $$;

create or replace function public.set_thread_context(
  p_thread_id uuid,
  p_expected_context_version bigint,
  p_thread_lane text default null,
  p_project_id text default null,
  p_community_id uuid default null,
  p_update_thread_lane boolean default false,
  p_update_project_id boolean default false,
  p_update_community_id boolean default false
)
returns table(
  thread_id uuid,
  thread_lane text,
  project_id text,
  community_id uuid,
  context_version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_thread public.threads%rowtype;
  v_next_thread_lane text;
  v_next_project_id text;
  v_next_community_id uuid;
  v_now timestamptz := now();
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_thread_id is null then
    raise exception 'thread_id is required' using errcode = '22023';
  end if;
  if p_expected_context_version is null then
    raise exception 'expected_context_version is required' using errcode = '22023';
  end if;

  select *
    into v_thread
    from public.threads t
   where t.id = p_thread_id
   limit 1;

  if not found then
    raise exception 'thread_not_found' using errcode = '22023';
  end if;
  if v_thread.owner_id <> v_user_id then
    raise exception 'forbidden' using errcode = '28000';
  end if;
  if v_thread.engine_id = 'community_chat' then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  v_next_thread_lane := v_thread.thread_lane;
  if p_update_thread_lane then
    if p_thread_lane is null or btrim(p_thread_lane) = '' then
      raise exception 'thread_lane is required when update_thread_lane is true' using errcode = '22023';
    end if;
    v_next_thread_lane := lower(btrim(p_thread_lane));
    if v_next_thread_lane not in ('chat', 'agent') then
      raise exception 'thread_lane must be chat or agent' using errcode = '22023';
    end if;
  end if;

  v_next_project_id := v_thread.project_id;
  if p_update_project_id then
    v_next_project_id := nullif(btrim(coalesce(p_project_id, '')), '');
  end if;

  v_next_community_id := v_thread.community_id;
  if p_update_community_id then
    v_next_community_id := p_community_id;
    if v_next_community_id is not null and not public.has_active_entitlement(v_next_community_id) then
      raise exception 'forbidden' using errcode = '28000';
    end if;
  end if;

  -- No-op patch returns current state without version bump.
  if v_next_thread_lane is not distinct from v_thread.thread_lane
     and v_next_project_id is not distinct from v_thread.project_id
     and v_next_community_id is not distinct from v_thread.community_id then
    return query
      select
        v_thread.id,
        v_thread.thread_lane,
        v_thread.project_id,
        v_thread.community_id,
        v_thread.context_version,
        v_thread.updated_at;
    return;
  end if;

  return query
  with updated as (
    update public.threads t
       set thread_lane = v_next_thread_lane,
           project_id = v_next_project_id,
           community_id = v_next_community_id,
           context_version = t.context_version + 1,
           updated_at = v_now
     where t.id = p_thread_id
       and t.context_version = p_expected_context_version
    returning t.id, t.thread_lane, t.project_id, t.community_id, t.context_version, t.updated_at
  )
  select
    updated.id,
    updated.thread_lane,
    updated.project_id,
    updated.community_id,
    updated.context_version,
    updated.updated_at
  from updated;

  if not found then
    raise exception 'thread_context_version_conflict' using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.set_thread_context(uuid, bigint, text, text, uuid, boolean, boolean, boolean) from public;
revoke all on function public.set_thread_context(uuid, bigint, text, text, uuid, boolean, boolean, boolean) from anon;
revoke all on function public.set_thread_context(uuid, bigint, text, text, uuid, boolean, boolean, boolean) from authenticated;
revoke all on function public.set_thread_context(uuid, bigint, text, text, uuid, boolean, boolean, boolean) from service_role;
grant execute on function public.set_thread_context(uuid, bigint, text, text, uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.set_thread_context(uuid, bigint, text, text, uuid, boolean, boolean, boolean) to service_role;

-- Backward-compatible RPC kept for older clients; now also increments context_version.
create or replace function public.set_thread_community_lens(
  p_thread_id uuid,
  p_community_id uuid default null
)
returns table(
  thread_id uuid,
  community_id uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_thread public.threads%rowtype;
  v_now timestamptz := now();
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_thread_id is null then
    raise exception 'thread_id is required' using errcode = '22023';
  end if;

  select *
    into v_thread
    from public.threads t
   where t.id = p_thread_id
   limit 1;

  if not found then
    raise exception 'thread_not_found' using errcode = '22023';
  end if;
  if v_thread.engine_id = 'community_chat' then
    raise exception 'forbidden' using errcode = '28000';
  end if;
  if v_thread.owner_id <> v_user_id then
    raise exception 'forbidden' using errcode = '28000';
  end if;
  if p_community_id is not null and not public.has_active_entitlement(p_community_id) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  if v_thread.community_id is not distinct from p_community_id then
    return query select v_thread.id, v_thread.community_id, v_thread.updated_at;
    return;
  end if;

  update public.threads
     set community_id = p_community_id,
         context_version = context_version + 1,
         updated_at = v_now
   where id = p_thread_id;

  return query select p_thread_id, p_community_id, v_now;
end;
$$;

revoke all on function public.set_thread_community_lens(uuid, uuid) from public;
revoke all on function public.set_thread_community_lens(uuid, uuid) from anon;
revoke all on function public.set_thread_community_lens(uuid, uuid) from authenticated;
revoke all on function public.set_thread_community_lens(uuid, uuid) from service_role;
grant execute on function public.set_thread_community_lens(uuid, uuid) to authenticated;
grant execute on function public.set_thread_community_lens(uuid, uuid) to service_role;
