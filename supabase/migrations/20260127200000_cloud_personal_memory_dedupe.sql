-- Prevent near-duplicate personal memory items.
--
-- Users (and the assistant) will often restate the same preference in slightly different wording.
-- This trigger skips inserts that are very similar to an existing memory item for the same
-- user + scope, keeping the memory list clean.

create extension if not exists pg_trgm;

create or replace function public.personal_memory_items_dedupe()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_exists boolean;
begin
  if new.user_id is null or new.content is null then
    return new;
  end if;

  select true into v_exists
  from public.personal_memory_items p
  where p.user_id = new.user_id
    and p.scope = new.scope
    and (p.scope_id is not distinct from new.scope_id)
    and similarity(lower(p.content), lower(new.content)) >= 0.65
  limit 1;

  if coalesce(v_exists, false) then
    -- Skip insert (treat as no-op) to avoid accumulating duplicates.
    return null;
  end if;

  return new;
end $$;

drop trigger if exists trg_personal_memory_items_dedupe on public.personal_memory_items;
create trigger trg_personal_memory_items_dedupe
before insert on public.personal_memory_items
for each row
execute function public.personal_memory_items_dedupe();

