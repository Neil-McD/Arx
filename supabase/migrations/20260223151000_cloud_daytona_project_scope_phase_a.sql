-- Phase A: project-scoped Daytona foundation (additive only).
-- - Introduce cloud_projects (max 5 active projects per owner via RPC guard)
-- - Add nullable project_id linkage to runtime tables
-- - Keep compatibility with existing thread-scoped behavior during cutover

create table if not exists public.cloud_projects (
  id text primary key default gen_random_uuid()::text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create index if not exists idx_cloud_projects_owner_updated
  on public.cloud_projects (owner_id, updated_at desc);

create index if not exists idx_cloud_projects_owner_status_updated
  on public.cloud_projects (owner_id, status, updated_at desc);

drop trigger if exists trg_cloud_projects_updated_at on public.cloud_projects;
create trigger trg_cloud_projects_updated_at
before update on public.cloud_projects
for each row execute function public.set_updated_at();

alter table public.cloud_projects enable row level security;

drop policy if exists cloud_projects_owner_select on public.cloud_projects;
create policy cloud_projects_owner_select
  on public.cloud_projects
  for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists cloud_projects_owner_insert on public.cloud_projects;
create policy cloud_projects_owner_insert
  on public.cloud_projects
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists cloud_projects_owner_update on public.cloud_projects;
create policy cloud_projects_owner_update
  on public.cloud_projects
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists cloud_projects_owner_delete on public.cloud_projects;
create policy cloud_projects_owner_delete
  on public.cloud_projects
  for delete
  to authenticated
  using (auth.uid() = owner_id);

grant select, insert, update, delete on table public.cloud_projects to authenticated;

alter table public.daytona_sandboxes
  add column if not exists project_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daytona_sandboxes_project_id_fkey'
      and conrelid = 'public.daytona_sandboxes'::regclass
  ) then
    alter table public.daytona_sandboxes
      add constraint daytona_sandboxes_project_id_fkey
      foreign key (project_id) references public.cloud_projects(id) on delete set null;
  end if;
end
$$;

create index if not exists idx_daytona_sandboxes_project
  on public.daytona_sandboxes (project_id);

create unique index if not exists idx_daytona_sandboxes_user_project_provider_unique
  on public.daytona_sandboxes (user_id, project_id, provider)
  where project_id is not null;

alter table public.runtime_runs
  add column if not exists project_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'runtime_runs_project_id_fkey'
      and conrelid = 'public.runtime_runs'::regclass
  ) then
    alter table public.runtime_runs
      add constraint runtime_runs_project_id_fkey
      foreign key (project_id) references public.cloud_projects(id) on delete set null;
  end if;
end
$$;

create index if not exists idx_runtime_runs_project_created
  on public.runtime_runs (project_id, created_at desc);

create or replace function public.create_cloud_project(
  p_name text,
  p_slug text default null
) returns public.cloud_projects
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_name text;
  v_slug_base text;
  v_slug text;
  v_suffix integer := 1;
  v_existing_count integer := 0;
  v_row public.cloud_projects;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'name is required' using errcode = '22023';
  end if;

  select count(*)::integer into v_existing_count
  from public.cloud_projects cp
  where cp.owner_id = v_user_id
    and cp.status = 'active';

  if v_existing_count >= 5 then
    raise exception 'project_limit_exceeded' using errcode = '22023';
  end if;

  v_slug_base := lower(btrim(coalesce(p_slug, v_name)));
  v_slug_base := regexp_replace(v_slug_base, '[^a-z0-9]+', '-', 'g');
  v_slug_base := regexp_replace(v_slug_base, '(^-+|-+$)', '', 'g');
  if v_slug_base = '' then
    v_slug_base := 'project';
  end if;
  if length(v_slug_base) > 48 then
    v_slug_base := left(v_slug_base, 48);
    v_slug_base := regexp_replace(v_slug_base, '-+$', '', 'g');
    if v_slug_base = '' then
      v_slug_base := 'project';
    end if;
  end if;

  v_slug := v_slug_base;
  while exists (
    select 1
    from public.cloud_projects cp
    where cp.owner_id = v_user_id
      and cp.slug = v_slug
  ) loop
    v_suffix := v_suffix + 1;
    v_slug := left(v_slug_base, greatest(1, 48 - length(v_suffix::text) - 1)) || '-' || v_suffix::text;
  end loop;

  insert into public.cloud_projects (owner_id, name, slug)
  values (v_user_id, v_name, v_slug)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.ensure_default_cloud_project()
returns public.cloud_projects
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row public.cloud_projects;
  v_active_count integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select *
    into v_row
    from public.cloud_projects cp
   where cp.owner_id = v_user_id
     and cp.slug = 'general'
   order by cp.updated_at desc, cp.created_at desc
   limit 1;

  if v_row.id is not null then
    if v_row.status <> 'active' then
      update public.cloud_projects cp
         set status = 'active'
       where cp.id = v_row.id
      returning * into v_row;
    end if;
    return v_row;
  end if;

  select count(*)::integer
    into v_active_count
    from public.cloud_projects cp
   where cp.owner_id = v_user_id
     and cp.status = 'active';

  if v_active_count >= 5 then
    select *
      into v_row
      from public.cloud_projects cp
     where cp.owner_id = v_user_id
       and cp.status = 'active'
     order by cp.updated_at desc, cp.created_at desc
     limit 1;
    if v_row.id is not null then
      return v_row;
    end if;
    raise exception 'project_limit_exceeded' using errcode = '22023';
  end if;

  begin
    insert into public.cloud_projects (owner_id, name, slug, status)
    values (v_user_id, 'General', 'general', 'active')
    returning * into v_row;
    return v_row;
  exception
    when unique_violation then
      select *
        into v_row
        from public.cloud_projects cp
       where cp.owner_id = v_user_id
         and cp.slug = 'general'
       order by cp.updated_at desc, cp.created_at desc
       limit 1;
      if v_row.id is not null then
        return v_row;
      end if;
  end;

  -- Fallback: if user has no "general" but has active projects at quota, reuse latest active.
  select *
    into v_row
    from public.cloud_projects cp
   where cp.owner_id = v_user_id
     and cp.status = 'active'
   order by cp.updated_at desc, cp.created_at desc
   limit 1;
  if v_row.id is not null then
    return v_row;
  end if;

  raise exception 'project_limit_exceeded' using errcode = '22023';
end;
$$;

create or replace function public.list_cloud_projects()
returns setof public.cloud_projects
language sql
security invoker
set search_path = public
as $$
  select *
  from public.cloud_projects cp
  where cp.owner_id = auth.uid()
  order by cp.updated_at desc, cp.created_at desc;
$$;

create or replace function public.rename_cloud_project(
  p_project_id text,
  p_name text
) returns public.cloud_projects
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_name text;
  v_row public.cloud_projects;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'name is required' using errcode = '22023';
  end if;

  update public.cloud_projects cp
     set name = v_name
   where cp.id = btrim(coalesce(p_project_id, ''))
     and cp.owner_id = v_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'project_not_found' using errcode = '22023';
  end if;

  return v_row;
end;
$$;

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

  update public.cloud_projects cp
     set status = 'archived'
   where cp.id = btrim(coalesce(p_project_id, ''))
     and cp.owner_id = v_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'project_not_found' using errcode = '22023';
  end if;

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
  v_exists boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_project_id := btrim(coalesce(p_project_id, ''));
  if v_project_id = '' then
    raise exception 'project_id is required' using errcode = '22023';
  end if;

  select exists(
    select 1
    from public.cloud_projects cp
    where cp.id = v_project_id
      and cp.owner_id = v_user_id
  ) into v_exists;

  if not v_exists then
    raise exception 'project_not_found' using errcode = '22023';
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

    update public.threads t
       set project_id = null,
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

grant execute on function public.create_cloud_project(text, text) to authenticated;
grant execute on function public.ensure_default_cloud_project() to authenticated;
grant execute on function public.list_cloud_projects() to authenticated;
grant execute on function public.rename_cloud_project(text, text) to authenticated;
grant execute on function public.archive_cloud_project(text) to authenticated;
grant execute on function public.delete_cloud_project(text, boolean) to authenticated;
