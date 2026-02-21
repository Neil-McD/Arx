-- Enforce canonical single-slot AI-agent draft contract (slot=1 only).
-- This aligns DB + RPC semantics with the simplified MVP UI/controller flow.

-- Canonicalize any existing multi-slot rows into one winner per community.
drop table if exists pg_temp._community_agent_draft_winners;
create temporary table _community_agent_draft_winners on commit drop as
select distinct on (d.community_id)
  d.id,
  d.community_id,
  d.name,
  coalesce(d.landing_json, '{}'::jsonb) as landing_json,
  coalesce(d.system_prompt, ''::text) as system_prompt,
  d.is_active,
  d.created_at,
  d.updated_at
from public.community_agent_drafts d
order by d.community_id, d.is_active desc, (d.slot = 1) desc, d.updated_at desc, d.created_at desc, d.id desc;

delete from public.community_agent_drafts;

insert into public.community_agent_drafts (
  id,
  community_id,
  slot,
  name,
  landing_json,
  system_prompt,
  is_active,
  created_at,
  updated_at
)
select
  w.id,
  w.community_id,
  1,
  w.name,
  w.landing_json,
  w.system_prompt,
  w.is_active,
  w.created_at,
  w.updated_at
from _community_agent_draft_winners w;

alter table public.community_agent_drafts
  alter column slot set default 1;

alter table public.community_agent_drafts
  drop constraint if exists community_agent_drafts_slot_check;

alter table public.community_agent_drafts
  add constraint community_agent_drafts_slot_check check (slot = 1);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_agent_drafts_community_id_key'
      and conrelid = 'public.community_agent_drafts'::regclass
  ) then
    alter table only public.community_agent_drafts
      add constraint community_agent_drafts_community_id_key unique (community_id);
  end if;
end $$;

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
     and d.slot = 1
   order by d.updated_at desc
   limit 1;
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

  v_slot := coalesce(p_slot, 1);
  if v_slot <> 1 then
    raise exception 'slot must be 1' using errcode = '22023';
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
    1,
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

  v_slot := coalesce(p_slot, 1);
  if v_slot <> 1 then
    raise exception 'slot must be 1' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.community_agent_drafts d
    where d.community_id = p_community_id
      and d.slot = 1
  ) then
    raise exception 'draft_not_found' using errcode = '22023';
  end if;

  update public.community_agent_drafts
     set is_active = true,
         updated_at = now()
   where community_id = p_community_id
     and slot = 1;
end;
$$;

alter function public.set_active_community_agent_draft(uuid, integer) owner to postgres;
revoke all on function public.set_active_community_agent_draft(uuid, integer) from public;
grant all on function public.set_active_community_agent_draft(uuid, integer) to authenticated;
grant all on function public.set_active_community_agent_draft(uuid, integer) to service_role;
