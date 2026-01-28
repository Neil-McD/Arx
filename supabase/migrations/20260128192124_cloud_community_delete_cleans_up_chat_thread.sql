-- Community deletion semantics
--
-- Problem:
-- - The community chat thread is keyed by community id (threads.id == communities.id).
-- - threads.community_id uses ON DELETE SET NULL to preserve non-chat threads.
-- - For community chat threads, that SET NULL violates the invariant constraint and/or leaves orphaned rows.
--
-- Fix:
-- - On community delete, proactively delete the canonical community chat thread so messages cascade.

create or replace function public.communities_before_delete_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  delete from public.threads t
  where t.id = old.id
    and t.engine_id = 'community_chat';

  return old;
end;
$$;

drop trigger if exists trg_communities_00_delete_cleanup on public.communities;
create trigger trg_communities_00_delete_cleanup
before delete on public.communities
for each row
execute function public.communities_before_delete_cleanup();

