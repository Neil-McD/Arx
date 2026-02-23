-- Phase C hardening for project-scoped runtime
-- - Enforce owned/active cloud project binding on context updates
-- - Prevent moving a thread across projects while an active run exists

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
    if v_next_project_id is null then
      raise exception 'project_id is required when update_project_id is true' using errcode = '22023';
    end if;

    perform 1
      from public.cloud_projects cp
     where cp.id = v_next_project_id
       and cp.owner_id = v_user_id
       and cp.status = 'active';
    if not found then
      raise exception 'forbidden' using errcode = '28000';
    end if;

    if v_next_project_id is distinct from v_thread.project_id then
      perform 1
        from public.runtime_runs r
       where r.thread_id = v_thread.id
         and r.status in ('queued', 'running')
       limit 1;
      if found then
        raise exception 'thread_has_active_run' using errcode = '55000';
      end if;
    end if;
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
