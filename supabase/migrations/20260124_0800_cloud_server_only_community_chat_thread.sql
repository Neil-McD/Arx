-- Make community chat thread creation server-only.
--
-- Why:
-- - The community chat thread is a canonical invariant (threads.id == community_id).
-- - Allowing arbitrary members to create the thread can set owner_id incorrectly, causing
--   destructive cascades (owner deletion -> thread deletion) and breaking reliability.
--
-- Approach:
-- - Drop the client insert policy for community_chat threads.
-- - Provide a SECURITY DEFINER RPC that any entitled member can call to ensure the thread exists.

-- Clients should call: rpc/ensure_community_chat_thread { p_community_id }
create or replace function public.ensure_community_chat_thread(p_community_id uuid)
returns table(thread_id uuid)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_owner_id uuid;
  v_existing_thread public.threads%rowtype;
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

  select c.owner_id
    into v_owner_id
    from public.communities c
   where c.id = p_community_id;

  if v_owner_id is null then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  select *
    into v_existing_thread
    from public.threads t
   where t.id = p_community_id
   limit 1;

  if found then
    if v_existing_thread.engine_id <> 'community_chat'
      or v_existing_thread.community_id is distinct from p_community_id
    then
      raise exception 'community_chat_thread_collision' using errcode = '23514';
    end if;

    return query select p_community_id;
    return;
  end if;

  insert into public.threads(
    id,
    owner_id,
    title,
    engine_id,
    model_id,
    community_id
  ) values (
    p_community_id,
    v_owner_id,
    'Community chat',
    'community_chat',
    null,
    p_community_id
  )
  on conflict (id) do nothing;

  return query select p_community_id;
end;
$$;

-- Lock down direct client inserts for the community chat thread.
drop policy if exists threads_insert_community_chat on public.threads;

-- Explicit grants (defense in depth).
revoke all on function public.ensure_community_chat_thread(uuid) from public;
grant execute on function public.ensure_community_chat_thread(uuid) to authenticated;
grant execute on function public.ensure_community_chat_thread(uuid) to service_role;

