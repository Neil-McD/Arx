-- Harden direct access to community_join_requests.
-- Keep application access on vetted SECURITY DEFINER RPCs.

alter table if exists public.community_join_requests
  enable row level security;

drop policy if exists community_join_requests_service_role_all
  on public.community_join_requests;

create policy community_join_requests_service_role_all
  on public.community_join_requests
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.community_join_requests from public;
revoke all on table public.community_join_requests from anon;
revoke all on table public.community_join_requests from authenticated;

grant select, insert, update, delete on table public.community_join_requests to service_role;
