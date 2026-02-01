-- Set the "community lens" for a personal thread (owner-scoped).
--
-- Contract:
-- - Threads remain cloud-canonical; a lens switch must not fork threads.
-- - Lens switching is entitlement-gated per request (fail closed).
-- - Community chat threads are never mutable via this RPC.

create or replace function public.set_thread_community_lens(
  p_thread_id uuid,
  p_community_id uuid default null
)
returns table(
  thread_id uuid,
  community_id uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_thread public.threads%rowtype;
  v_now timestamptz := now();
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_thread_id is null then
    raise exception 'thread_id is required' using errcode = '22023';
  end if;

  select *
    into v_thread
    from public.threads t
   where t.id = p_thread_id
   limit 1;

  if not found then
    raise exception 'thread_not_found' using errcode = '22023';
  end if;

  if v_thread.engine_id = 'community_chat' then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  if v_thread.owner_id <> v_user_id then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  -- Allow clearing the lens; otherwise require active entitlement to the target community.
  if p_community_id is not null then
    if not public.has_active_entitlement(p_community_id) then
      raise exception 'forbidden' using errcode = '28000';
    end if;
  end if;

  update public.threads
     set community_id = p_community_id,
         updated_at = v_now
   where id = p_thread_id;

  return query select p_thread_id, p_community_id, v_now;
end;
$$;

-- Explicit grants (defense in depth).
revoke all on function public.set_thread_community_lens(uuid, uuid) from public;
revoke all on function public.set_thread_community_lens(uuid, uuid) from anon;
revoke all on function public.set_thread_community_lens(uuid, uuid) from authenticated;
revoke all on function public.set_thread_community_lens(uuid, uuid) from service_role;
grant execute on function public.set_thread_community_lens(uuid, uuid) to authenticated;
grant execute on function public.set_thread_community_lens(uuid, uuid) to service_role;

