-- Add optional cloud project description metadata and extend create RPC.

alter table public.cloud_projects
  add column if not exists description text;

drop function if exists public.create_cloud_project(text, text);

create or replace function public.create_cloud_project(
  p_name text,
  p_slug text default null,
  p_description text default null
) returns public.cloud_projects
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_name text;
  v_description text;
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

  v_description := nullif(btrim(coalesce(p_description, '')), '');

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

  insert into public.cloud_projects (owner_id, name, description, slug)
  values (v_user_id, v_name, v_description, v_slug)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_cloud_project(text, text, text) to authenticated;
