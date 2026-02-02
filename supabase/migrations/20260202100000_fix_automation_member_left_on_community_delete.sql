-- Fix: deleting a community cascades deletes community_memberships.
-- The AFTER DELETE trigger on community_memberships enqueued a "member_left" automation event,
-- but the community row is already gone during cascade, so the insert violated the FK to communities.

create or replace function public.enqueue_automation_member_left()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  -- If the membership is being deleted because the community is being deleted, skip.
  if not exists (select 1 from public.communities c where c.id = old.community_id) then
    return old;
  end if;

  insert into public.automation_events(
    community_id,
    event_type,
    payload,
    occurred_at,
    status,
    next_attempt_at,
    idempotency_key
  ) values (
    old.community_id,
    'community.member_left',
    jsonb_build_object(
      'membership_id', old.id,
      'user_id', old.user_id,
      'role', old.role
    ),
    now(),
    'pending',
    now(),
    format('community.member_left:%s', old.id::text)
  )
  on conflict (idempotency_key) do nothing;

  return old;
end;
$$;

