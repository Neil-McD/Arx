-- Restore canonical AI Agent draft primitives required by the current MVP UI/harness.
-- Keep deferred automation/dev-only helper surfaces removed.

create table if not exists public.community_agent_drafts (
  id uuid default gen_random_uuid() not null,
  community_id uuid not null,
  slot integer not null,
  name text,
  landing_json jsonb not null,
  system_prompt text default ''::text not null,
  is_active boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint community_agent_drafts_slot_check check (slot >= 1 and slot <= 3)
);

alter table public.community_agent_drafts owner to postgres;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_agent_drafts_pkey'
      and conrelid = 'public.community_agent_drafts'::regclass
  ) then
    alter table only public.community_agent_drafts
      add constraint community_agent_drafts_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_agent_drafts_community_id_slot_key'
      and conrelid = 'public.community_agent_drafts'::regclass
  ) then
    alter table only public.community_agent_drafts
      add constraint community_agent_drafts_community_id_slot_key unique (community_id, slot);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_agent_drafts_community_id_fkey'
      and conrelid = 'public.community_agent_drafts'::regclass
  ) then
    alter table only public.community_agent_drafts
      add constraint community_agent_drafts_community_id_fkey
      foreign key (community_id) references public.communities(id) on delete cascade;
  end if;
end $$;

create unique index if not exists uq_community_agent_drafts_one_active
  on public.community_agent_drafts using btree (community_id)
  where is_active;

drop trigger if exists community_agent_drafts_set_updated_at on public.community_agent_drafts;
create trigger community_agent_drafts_set_updated_at
before update on public.community_agent_drafts
for each row execute function public.set_updated_at();

alter table public.community_agent_drafts enable row level security;
drop policy if exists community_agent_drafts_no_delete on public.community_agent_drafts;
drop policy if exists community_agent_drafts_no_insert on public.community_agent_drafts;
drop policy if exists community_agent_drafts_no_select on public.community_agent_drafts;
drop policy if exists community_agent_drafts_no_update on public.community_agent_drafts;
create policy community_agent_drafts_no_delete
  on public.community_agent_drafts for delete to authenticated using (false);
create policy community_agent_drafts_no_insert
  on public.community_agent_drafts for insert to authenticated with check (false);
create policy community_agent_drafts_no_select
  on public.community_agent_drafts for select to authenticated using (false);
create policy community_agent_drafts_no_update
  on public.community_agent_drafts for update to authenticated using (false) with check (false);

revoke all on table public.community_agent_drafts from public;
revoke all on table public.community_agent_drafts from anon;
revoke all on table public.community_agent_drafts from authenticated;
grant all on table public.community_agent_drafts to service_role;

create or replace function public.get_active_community_agent_landing(
  p_community_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_landing jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement(p_community_id) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  if not public.community_owner_is_pro(p_community_id) then
    return null;
  end if;

  select d.landing_json
    into v_landing
    from public.community_agent_drafts d
   where d.community_id = p_community_id
     and d.is_active = true
   limit 1;

  return v_landing;
end;
$$;

alter function public.get_active_community_agent_landing(uuid) owner to postgres;
revoke all on function public.get_active_community_agent_landing(uuid) from public;
grant all on function public.get_active_community_agent_landing(uuid) to authenticated;
grant all on function public.get_active_community_agent_landing(uuid) to service_role;

create or replace function public.get_active_community_agent_system_prompt(
  p_user_id uuid,
  p_community_id uuid
) returns table(draft_id uuid, system_prompt text)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_user_id is null or p_community_id is null then
    return;
  end if;

  if not public.user_has_active_entitlement(p_user_id, p_community_id) then
    return;
  end if;

  if not public.community_owner_is_pro(p_community_id) then
    return;
  end if;

  return query
  select d.id, d.system_prompt
    from public.community_agent_drafts d
   where d.community_id = p_community_id
     and d.is_active = true
   limit 1;
end;
$$;

alter function public.get_active_community_agent_system_prompt(uuid, uuid) owner to postgres;
revoke all on function public.get_active_community_agent_system_prompt(uuid, uuid) from public;
grant all on function public.get_active_community_agent_system_prompt(uuid, uuid) to authenticated;
grant all on function public.get_active_community_agent_system_prompt(uuid, uuid) to service_role;

create or replace function public.list_community_agent_drafts(
  p_community_id uuid
) returns table(
  id uuid,
  community_id uuid,
  slot integer,
  name text,
  landing_json jsonb,
  system_prompt text,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner', 'admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  if not public.community_owner_is_pro(p_community_id) then
    raise exception 'pro_plan_required' using errcode = '42501';
  end if;

  return query
  select d.id, d.community_id, d.slot, d.name, d.landing_json, d.system_prompt, d.is_active, d.updated_at
    from public.community_agent_drafts d
   where d.community_id = p_community_id
   order by d.slot asc;
end;
$$;

alter function public.list_community_agent_drafts(uuid) owner to postgres;
revoke all on function public.list_community_agent_drafts(uuid) from public;
grant all on function public.list_community_agent_drafts(uuid) to authenticated;
grant all on function public.list_community_agent_drafts(uuid) to service_role;

create or replace function public.upsert_community_agent_draft(
  p_community_id uuid,
  p_slot integer,
  p_name text,
  p_landing_json jsonb,
  p_system_prompt text
) returns table(
  id uuid,
  slot integer,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_slot integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner', 'admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  if not public.community_owner_is_pro(p_community_id) then
    raise exception 'pro_plan_required' using errcode = '42501';
  end if;

  v_slot := coalesce(p_slot, 0);
  if v_slot < 1 or v_slot > 3 then
    raise exception 'slot must be between 1 and 3' using errcode = '22023';
  end if;

  insert into public.community_agent_drafts(
    community_id,
    slot,
    name,
    landing_json,
    system_prompt,
    updated_at
  ) values (
    p_community_id,
    v_slot,
    nullif(btrim(coalesce(p_name, '')), ''),
    coalesce(p_landing_json, '{}'::jsonb),
    coalesce(p_system_prompt, ''),
    now()
  )
  on conflict on constraint community_agent_drafts_community_id_slot_key
  do update set
    name = excluded.name,
    landing_json = excluded.landing_json,
    system_prompt = excluded.system_prompt,
    updated_at = now()
  returning community_agent_drafts.id,
            community_agent_drafts.slot,
            community_agent_drafts.is_active,
            community_agent_drafts.updated_at
  into id, slot, is_active, updated_at;

  return next;
end;
$$;

alter function public.upsert_community_agent_draft(uuid, integer, text, jsonb, text) owner to postgres;
revoke all on function public.upsert_community_agent_draft(uuid, integer, text, jsonb, text) from public;
grant all on function public.upsert_community_agent_draft(uuid, integer, text, jsonb, text) to authenticated;
grant all on function public.upsert_community_agent_draft(uuid, integer, text, jsonb, text) to service_role;

create or replace function public.set_active_community_agent_draft(
  p_community_id uuid,
  p_slot integer
) returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_slot integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner', 'admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  if not public.community_owner_is_pro(p_community_id) then
    raise exception 'pro_plan_required' using errcode = '42501';
  end if;

  v_slot := coalesce(p_slot, 0);
  if v_slot < 1 or v_slot > 3 then
    raise exception 'slot must be between 1 and 3' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.community_agent_drafts d
    where d.community_id = p_community_id
      and d.slot = v_slot
  ) then
    raise exception 'draft_not_found' using errcode = '22023';
  end if;

  update public.community_agent_drafts
     set is_active = (slot = v_slot),
         updated_at = now()
   where community_id = p_community_id;
end;
$$;

alter function public.set_active_community_agent_draft(uuid, integer) owner to postgres;
revoke all on function public.set_active_community_agent_draft(uuid, integer) from public;
grant all on function public.set_active_community_agent_draft(uuid, integer) to authenticated;
grant all on function public.set_active_community_agent_draft(uuid, integer) to service_role;
