-- Enforce irreducible project-thread invariant for cloud non-community threads:
-- - every non-community thread must have project_id
-- - General remains available as the default project
-- - force delete reassigns threads to General instead of nulling project_id

-- 1) Backfill any legacy non-community null-project threads to owner default project.
do $$
declare
  v_owner_id uuid;
  v_project_id text;
begin
  for v_owner_id in
    select distinct t.owner_id
      from public.threads t
     where t.engine_id <> 'community_chat'
       and t.project_id is null
  loop
    v_project_id := null;

    select cp.id
      into v_project_id
      from public.cloud_projects cp
     where cp.owner_id = v_owner_id
       and cp.slug = 'general'
     order by cp.updated_at desc, cp.created_at desc
     limit 1;

    if v_project_id is null then
      select cp.id
        into v_project_id
        from public.cloud_projects cp
       where cp.owner_id = v_owner_id
         and cp.status = 'active'
       order by cp.updated_at desc, cp.created_at desc
       limit 1;
    end if;

    if v_project_id is null then
      begin
        insert into public.cloud_projects (owner_id, name, slug, status)
        values (v_owner_id, 'General', 'general', 'active')
        returning id into v_project_id;
      exception
        when unique_violation then
          select cp.id
            into v_project_id
            from public.cloud_projects cp
           where cp.owner_id = v_owner_id
             and cp.slug = 'general'
           order by cp.updated_at desc, cp.created_at desc
           limit 1;
      end;
    end if;

    if v_project_id is not null then
      update public.threads t
         set project_id = v_project_id,
             context_version = coalesce(t.context_version, 0) + 1,
             updated_at = now()
       where t.owner_id = v_owner_id
         and t.engine_id <> 'community_chat'
         and t.project_id is null;
    end if;
  end loop;
end
$$;

-- 2) Hard DB constraint: non-community threads must always be project-bound.
alter table public.threads
  drop constraint if exists threads_non_community_requires_project;

alter table public.threads
  add constraint threads_non_community_requires_project
  check (
    engine_id = 'community_chat'
    or project_id is not null
  ) not valid;

alter table public.threads
  validate constraint threads_non_community_requires_project;

-- 3) Keep General available as the default project (cannot archive/delete it).
create or replace function public.archive_cloud_project(
  p_project_id text
) returns public.cloud_projects
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row public.cloud_projects;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select *
    into v_row
    from public.cloud_projects cp
   where cp.id = btrim(coalesce(p_project_id, ''))
     and cp.owner_id = v_user_id
   limit 1;

  if v_row.id is null then
    raise exception 'project_not_found' using errcode = '22023';
  end if;
  if v_row.slug = 'general' then
    raise exception 'cannot_archive_default_project' using errcode = '22023';
  end if;

  update public.cloud_projects cp
     set status = 'archived'
   where cp.id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_cloud_project(
  p_project_id text,
  p_force boolean default false
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_project_id text;
  v_target public.cloud_projects%rowtype;
  v_fallback_project public.cloud_projects%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_project_id := btrim(coalesce(p_project_id, ''));
  if v_project_id = '' then
    raise exception 'project_id is required' using errcode = '22023';
  end if;

  select *
    into v_target
    from public.cloud_projects cp
   where cp.id = v_project_id
     and cp.owner_id = v_user_id
   limit 1;

  if v_target.id is null then
    raise exception 'project_not_found' using errcode = '22023';
  end if;
  if v_target.slug = 'general' then
    raise exception 'cannot_delete_default_project' using errcode = '22023';
  end if;

  if exists(
    select 1
      from public.threads t
     where t.owner_id = v_user_id
       and t.project_id = v_project_id
  ) then
    if not coalesce(p_force, false) then
      raise exception 'project_has_threads' using errcode = '22023';
    end if;

    select *
      into v_fallback_project
      from public.ensure_default_cloud_project()
      limit 1;

    if v_fallback_project.id is null or v_fallback_project.id = v_project_id then
      raise exception 'default_project_unavailable' using errcode = '22023';
    end if;

    update public.threads t
       set project_id = v_fallback_project.id,
           context_version = coalesce(t.context_version, 0) + 1,
           updated_at = now()
     where t.owner_id = v_user_id
       and t.project_id = v_project_id;
  end if;

  delete from public.cloud_projects cp
   where cp.id = v_project_id
     and cp.owner_id = v_user_id;
end;
$$;

-- 4) Guard set_thread_context from ever returning a null project for non-community threads.
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

  if v_next_project_id is null then
    raise exception 'project_id_required' using errcode = '22023';
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
