-- Phase B: backfill legacy thread-scoped/null project data to project-scoped model.
-- Preconditions:
-- - Phase A migration applied (cloud_projects + project_id linkage columns/RPCs).

do $$
declare
  v_owner_id uuid;
  v_project_id text;
begin
  for v_owner_id in
    select distinct t.owner_id
    from public.threads t
    where t.thread_lane = 'chat'
      and t.project_id is null
  loop
    v_project_id := null;

    -- Prefer existing owner "general" project.
    select cp.id
      into v_project_id
      from public.cloud_projects cp
     where cp.owner_id = v_owner_id
       and cp.slug = 'general'
     order by cp.updated_at desc, cp.created_at desc
     limit 1;

    -- Otherwise use latest active project if present.
    if v_project_id is null then
      select cp.id
        into v_project_id
        from public.cloud_projects cp
       where cp.owner_id = v_owner_id
         and cp.status = 'active'
       order by cp.updated_at desc, cp.created_at desc
       limit 1;
    end if;

    -- Otherwise create owner default.
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
         and t.thread_lane = 'chat'
         and t.project_id is null;
    end if;
  end loop;
end
$$;

-- Backfill runtime run project linkage from thread ownership.
update public.runtime_runs r
   set project_id = t.project_id
  from public.threads t
 where r.thread_id = t.id
   and r.project_id is null
   and t.project_id is not null;

-- Backfill sandbox project linkage from linked thread, where available.
update public.daytona_sandboxes s
   set project_id = t.project_id,
       last_used_at = coalesce(s.last_used_at, now())
  from public.threads t
 where s.thread_id = t.id
   and s.project_id is null
   and t.project_id is not null;

