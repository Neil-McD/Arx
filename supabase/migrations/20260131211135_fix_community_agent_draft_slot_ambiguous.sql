-- Fix "column reference \"slot\" is ambiguous" when saving community agent drafts.
--
-- In PL/pgSQL, the function's OUT parameter `slot` can clash with unqualified
-- references to the table column `slot` inside SQL statements. Using the unique
-- constraint name avoids that ambiguity.

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

