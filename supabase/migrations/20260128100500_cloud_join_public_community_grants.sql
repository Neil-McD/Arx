-- Ensure join_public_community RPC has explicit grants after signature changes.
--
-- This function is SECURITY DEFINER and disables RLS, but it enforces auth.uid()
-- and community visibility checks internally. Still, it should not be callable by anon.

revoke all on function public.join_public_community(uuid, uuid) from public;
revoke all on function public.join_public_community(uuid, uuid) from anon;
revoke all on function public.join_public_community(uuid, uuid) from authenticated;
grant execute on function public.join_public_community(uuid, uuid) to authenticated;
grant execute on function public.join_public_community(uuid, uuid) to service_role;
