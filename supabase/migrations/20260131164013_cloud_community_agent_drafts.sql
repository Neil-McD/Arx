-- Community agent drafts (Pro/$100 tier only).
--
-- Builders on the Pro plan ($100/mo) can customize the "empty thread" landing UI
-- and a community-scoped system prompt. Up to 3 drafts per community; exactly one
-- can be active at a time. Members only ever see the landing UI via the empty
-- thread screen (no browsing of settings).

create table if not exists public.community_agent_drafts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  slot integer not null check (slot between 1 and 3),
  name text,
  landing_json jsonb not null,
  system_prompt text not null default '',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, slot)
);

drop trigger if exists community_agent_drafts_set_updated_at on public.community_agent_drafts;
create trigger community_agent_drafts_set_updated_at
before update on public.community_agent_drafts
for each row
execute function public.set_updated_at();

-- Only one active draft per community.
create unique index if not exists uq_community_agent_drafts_one_active
  on public.community_agent_drafts(community_id)
  where is_active;

alter table public.community_agent_drafts enable row level security;

-- No direct table access for authenticated users (use SECURITY DEFINER RPCs).
drop policy if exists community_agent_drafts_no_select on public.community_agent_drafts;
create policy community_agent_drafts_no_select
on public.community_agent_drafts
for select
to authenticated
using (false);

drop policy if exists community_agent_drafts_no_insert on public.community_agent_drafts;
create policy community_agent_drafts_no_insert
on public.community_agent_drafts
for insert
to authenticated
with check (false);

drop policy if exists community_agent_drafts_no_update on public.community_agent_drafts;
create policy community_agent_drafts_no_update
on public.community_agent_drafts
for update
to authenticated
using (false)
with check (false);

drop policy if exists community_agent_drafts_no_delete on public.community_agent_drafts;
create policy community_agent_drafts_no_delete
on public.community_agent_drafts
for delete
to authenticated
using (false);

-- -----------------------------------------------------------------------------
-- Helpers / RPCs
-- -----------------------------------------------------------------------------

-- Pro tier gate for a community (based on the community owner's builder tier).
create or replace function public.community_owner_is_pro(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.communities c
    join public.profiles p on p.user_id = c.owner_id
    where c.id = p_community_id
      and lower(coalesce(p.builder_tier, '')) = 'pro'
  );
$$;

-- Members: read the active landing UI for a community, but only if entitled.
-- Returns NULL when:
-- - the community has no active draft
-- - the community owner is not Pro
create or replace function public.get_active_community_agent_landing(p_community_id uuid)
returns jsonb
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

-- Admins/owners: list drafts (includes system prompt).
create or replace function public.list_community_agent_drafts(p_community_id uuid)
returns table(
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

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
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

create or replace function public.upsert_community_agent_draft(
  p_community_id uuid,
  p_slot integer,
  p_name text,
  p_landing_json jsonb,
  p_system_prompt text
)
returns table(
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

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
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
  on conflict (community_id, slot)
  do update set
    name = excluded.name,
    landing_json = excluded.landing_json,
    system_prompt = excluded.system_prompt,
    updated_at = now()
  returning community_agent_drafts.id, community_agent_drafts.slot, community_agent_drafts.is_active, community_agent_drafts.updated_at
  into id, slot, is_active, updated_at;

  return next;
end;
$$;

create or replace function public.set_active_community_agent_draft(p_community_id uuid, p_slot integer)
returns void
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

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
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

-- Server-side retrieval for inference: returns the active system prompt only when
-- the requesting user is entitled AND the community owner is Pro.
create or replace function public.get_active_community_agent_system_prompt(
  p_user_id uuid,
  p_community_id uuid
)
returns table(
  draft_id uuid,
  system_prompt text
)
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

-- -----------------------------------------------------------------------------
-- Grants (fail closed)
-- -----------------------------------------------------------------------------

revoke all on table public.community_agent_drafts from public;
revoke all on table public.community_agent_drafts from anon;
revoke all on table public.community_agent_drafts from authenticated;

revoke all on function public.community_owner_is_pro(uuid) from public;
revoke all on function public.community_owner_is_pro(uuid) from anon;
revoke all on function public.community_owner_is_pro(uuid) from authenticated;
revoke all on function public.community_owner_is_pro(uuid) from service_role;
grant execute on function public.community_owner_is_pro(uuid) to authenticated;
grant execute on function public.community_owner_is_pro(uuid) to service_role;

revoke all on function public.get_active_community_agent_landing(uuid) from public;
revoke all on function public.get_active_community_agent_landing(uuid) from anon;
revoke all on function public.get_active_community_agent_landing(uuid) from authenticated;
revoke all on function public.get_active_community_agent_landing(uuid) from service_role;
grant execute on function public.get_active_community_agent_landing(uuid) to authenticated;
grant execute on function public.get_active_community_agent_landing(uuid) to service_role;

revoke all on function public.list_community_agent_drafts(uuid) from public;
revoke all on function public.list_community_agent_drafts(uuid) from anon;
revoke all on function public.list_community_agent_drafts(uuid) from authenticated;
revoke all on function public.list_community_agent_drafts(uuid) from service_role;
grant execute on function public.list_community_agent_drafts(uuid) to authenticated;
grant execute on function public.list_community_agent_drafts(uuid) to service_role;

revoke all on function public.upsert_community_agent_draft(uuid, integer, text, jsonb, text) from public;
revoke all on function public.upsert_community_agent_draft(uuid, integer, text, jsonb, text) from anon;
revoke all on function public.upsert_community_agent_draft(uuid, integer, text, jsonb, text) from authenticated;
revoke all on function public.upsert_community_agent_draft(uuid, integer, text, jsonb, text) from service_role;
grant execute on function public.upsert_community_agent_draft(uuid, integer, text, jsonb, text) to authenticated;
grant execute on function public.upsert_community_agent_draft(uuid, integer, text, jsonb, text) to service_role;

revoke all on function public.set_active_community_agent_draft(uuid, integer) from public;
revoke all on function public.set_active_community_agent_draft(uuid, integer) from anon;
revoke all on function public.set_active_community_agent_draft(uuid, integer) from authenticated;
revoke all on function public.set_active_community_agent_draft(uuid, integer) from service_role;
grant execute on function public.set_active_community_agent_draft(uuid, integer) to authenticated;
grant execute on function public.set_active_community_agent_draft(uuid, integer) to service_role;

revoke all on function public.get_active_community_agent_system_prompt(uuid, uuid) from public;
revoke all on function public.get_active_community_agent_system_prompt(uuid, uuid) from anon;
revoke all on function public.get_active_community_agent_system_prompt(uuid, uuid) from authenticated;
revoke all on function public.get_active_community_agent_system_prompt(uuid, uuid) from service_role;
grant execute on function public.get_active_community_agent_system_prompt(uuid, uuid) to authenticated;
grant execute on function public.get_active_community_agent_system_prompt(uuid, uuid) to service_role;

