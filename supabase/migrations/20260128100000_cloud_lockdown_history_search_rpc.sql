-- Lock down cross-thread history search RPC.
--
-- This function is SECURITY DEFINER and disables RLS, so it must NOT be callable
-- by anon/authenticated clients. It is intended for server-side use (Edge Functions)
-- via the service_role key.

revoke all on function public.search_user_message_snippets(uuid, text, uuid, integer) from public;
revoke all on function public.search_user_message_snippets(uuid, text, uuid, integer) from anon;
revoke all on function public.search_user_message_snippets(uuid, text, uuid, integer) from authenticated;
grant execute on function public.search_user_message_snippets(uuid, text, uuid, integer) to service_role;

