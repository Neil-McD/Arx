-- Harden join-request RPC execute grants.
-- Restrict these RPCs to authenticated and service_role callers.

revoke all on function public.get_my_join_request_by_slug(text) from public;
revoke all on function public.get_my_join_request_by_slug(text) from anon;
revoke all on function public.get_my_join_request_by_slug(text) from authenticated;
revoke all on function public.get_my_join_request_by_slug(text) from service_role;
grant execute on function public.get_my_join_request_by_slug(text) to authenticated;
grant execute on function public.get_my_join_request_by_slug(text) to service_role;

revoke all on function public.request_community_access_by_slug(text, text) from public;
revoke all on function public.request_community_access_by_slug(text, text) from anon;
revoke all on function public.request_community_access_by_slug(text, text) from authenticated;
revoke all on function public.request_community_access_by_slug(text, text) from service_role;
grant execute on function public.request_community_access_by_slug(text, text) to authenticated;
grant execute on function public.request_community_access_by_slug(text, text) to service_role;

revoke all on function public.list_community_join_requests(uuid) from public;
revoke all on function public.list_community_join_requests(uuid) from anon;
revoke all on function public.list_community_join_requests(uuid) from authenticated;
revoke all on function public.list_community_join_requests(uuid) from service_role;
grant execute on function public.list_community_join_requests(uuid) to authenticated;
grant execute on function public.list_community_join_requests(uuid) to service_role;

revoke all on function public.approve_community_join_request(uuid) from public;
revoke all on function public.approve_community_join_request(uuid) from anon;
revoke all on function public.approve_community_join_request(uuid) from authenticated;
revoke all on function public.approve_community_join_request(uuid) from service_role;
grant execute on function public.approve_community_join_request(uuid) to authenticated;
grant execute on function public.approve_community_join_request(uuid) to service_role;

revoke all on function public.deny_community_join_request(uuid) from public;
revoke all on function public.deny_community_join_request(uuid) from anon;
revoke all on function public.deny_community_join_request(uuid) from authenticated;
revoke all on function public.deny_community_join_request(uuid) from service_role;
grant execute on function public.deny_community_join_request(uuid) to authenticated;
grant execute on function public.deny_community_join_request(uuid) to service_role;
