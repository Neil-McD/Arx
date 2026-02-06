-- Community funnel configuration (builder-authored landing schema).
--
-- Goal:
-- - Persist a guarded, template-driven funnel schema per community.
-- - Keep one active schema per community with explicit owner/admin control.
-- - Expose read-only public schema for the canonical /c/<slug> landing endpoint.

create table if not exists public.community_funnel_configs (
  community_id uuid primary key references public.communities(id) on delete cascade,
  is_enabled boolean not null default false,
  schema_json jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists community_funnel_configs_set_updated_at on public.community_funnel_configs;
create trigger community_funnel_configs_set_updated_at
before update on public.community_funnel_configs
for each row execute function public.set_updated_at();

alter table public.community_funnel_configs enable row level security;

drop policy if exists community_funnel_configs_admin_select on public.community_funnel_configs;
create policy community_funnel_configs_admin_select
on public.community_funnel_configs
for select
to authenticated
using (public.has_active_entitlement_role(community_id, array['owner','admin']));

drop policy if exists community_funnel_configs_admin_insert on public.community_funnel_configs;
create policy community_funnel_configs_admin_insert
on public.community_funnel_configs
for insert
to authenticated
with check (public.has_active_entitlement_role(community_id, array['owner','admin']));

drop policy if exists community_funnel_configs_admin_update on public.community_funnel_configs;
create policy community_funnel_configs_admin_update
on public.community_funnel_configs
for update
to authenticated
using (public.has_active_entitlement_role(community_id, array['owner','admin']))
with check (public.has_active_entitlement_role(community_id, array['owner','admin']));

drop function if exists public.get_community_funnel_config(uuid);
create or replace function public.get_community_funnel_config(p_community_id uuid)
returns table(
  community_id uuid,
  is_enabled boolean,
  schema_json jsonb,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  insert into public.community_funnel_configs(community_id, is_enabled, schema_json, updated_by)
  values (p_community_id, false, '{}'::jsonb, v_user_id)
  on conflict (community_id) do nothing;

  return query
  select
    c.community_id,
    c.is_enabled,
    c.schema_json,
    c.updated_by,
    c.created_at,
    c.updated_at
  from public.community_funnel_configs c
  where c.community_id = p_community_id
  limit 1;
end;
$$;

revoke all on function public.get_community_funnel_config(uuid) from public;
revoke all on function public.get_community_funnel_config(uuid) from anon;
revoke all on function public.get_community_funnel_config(uuid) from authenticated;
revoke all on function public.get_community_funnel_config(uuid) from service_role;
grant execute on function public.get_community_funnel_config(uuid) to authenticated;
grant execute on function public.get_community_funnel_config(uuid) to service_role;

drop function if exists public.save_community_funnel_config(uuid, boolean, jsonb);
create or replace function public.save_community_funnel_config(
  p_community_id uuid,
  p_is_enabled boolean default false,
  p_schema_json jsonb default '{}'::jsonb
)
returns table(
  community_id uuid,
  is_enabled boolean,
  schema_json jsonb,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_schema jsonb := coalesce(p_schema_json, '{}'::jsonb);
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  if jsonb_typeof(v_schema) is distinct from 'object' then
    raise exception 'schema_json must be an object' using errcode = '22023';
  end if;

  if length(v_schema::text) > 200000 then
    raise exception 'schema_json too large' using errcode = '22023';
  end if;

  insert into public.community_funnel_configs(community_id, is_enabled, schema_json, updated_by)
  values (
    p_community_id,
    coalesce(p_is_enabled, false),
    v_schema,
    v_user_id
  )
  on conflict (community_id)
  do update set
    is_enabled = excluded.is_enabled,
    schema_json = excluded.schema_json,
    updated_by = excluded.updated_by,
    updated_at = now();

  return query
  select
    c.community_id,
    c.is_enabled,
    c.schema_json,
    c.updated_by,
    c.created_at,
    c.updated_at
  from public.community_funnel_configs c
  where c.community_id = p_community_id
  limit 1;
end;
$$;

revoke all on function public.save_community_funnel_config(uuid, boolean, jsonb) from public;
revoke all on function public.save_community_funnel_config(uuid, boolean, jsonb) from anon;
revoke all on function public.save_community_funnel_config(uuid, boolean, jsonb) from authenticated;
revoke all on function public.save_community_funnel_config(uuid, boolean, jsonb) from service_role;
grant execute on function public.save_community_funnel_config(uuid, boolean, jsonb) to authenticated;
grant execute on function public.save_community_funnel_config(uuid, boolean, jsonb) to service_role;

drop function if exists public.get_public_community_funnel_config_by_slug(text);
create or replace function public.get_public_community_funnel_config_by_slug(p_community_slug text)
returns table(
  community_id uuid,
  slug text,
  is_enabled boolean,
  schema_json jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_slug text;
begin
  v_slug := lower(btrim(coalesce(p_community_slug, '')));
  if v_slug = '' then
    raise exception 'community_slug is required' using errcode = '22023';
  end if;

  return query
  select
    c.id as community_id,
    c.slug,
    coalesce(cfg.is_enabled, false) as is_enabled,
    coalesce(cfg.schema_json, '{}'::jsonb) as schema_json,
    coalesce(cfg.updated_at, c.updated_at) as updated_at
  from public.communities c
  left join public.community_funnel_configs cfg
    on cfg.community_id = c.id
  where c.slug = v_slug
    and c.visibility in ('public','private','unlisted')
  limit 1;
end;
$$;

revoke all on function public.get_public_community_funnel_config_by_slug(text) from public;
revoke all on function public.get_public_community_funnel_config_by_slug(text) from anon;
revoke all on function public.get_public_community_funnel_config_by_slug(text) from authenticated;
revoke all on function public.get_public_community_funnel_config_by_slug(text) from service_role;
grant execute on function public.get_public_community_funnel_config_by_slug(text) to anon;
grant execute on function public.get_public_community_funnel_config_by_slug(text) to authenticated;
grant execute on function public.get_public_community_funnel_config_by_slug(text) to service_role;
