-- Lock down SECURITY DEFINER function grants.
--
-- Why:
-- - Postgres grants EXECUTE on new functions to PUBLIC by default.
-- - SECURITY DEFINER functions (especially those with `row_security = off`) are part of the auth surface.
-- - We want an explicit allowlist: no `anon` execution, and server-only helpers should not be callable by users.
--
-- Policy:
-- - Client/RLS helpers: grant EXECUTE to `authenticated` (+ `service_role` for internal/server use).
-- - Server-only RPCs: grant EXECUTE only to `service_role`.
-- - Trigger-only helpers: no grants (only function owner executes).

-- -----------------------------------------------------------------------------
-- Client + RLS helpers (authenticated + service_role)
-- -----------------------------------------------------------------------------

revoke all on function public.accept_community_invite(text) from public;
revoke all on function public.accept_community_invite(text) from anon;
revoke all on function public.accept_community_invite(text) from authenticated;
revoke all on function public.accept_community_invite(text) from service_role;
grant execute on function public.accept_community_invite(text) to authenticated;
grant execute on function public.accept_community_invite(text) to service_role;

revoke all on function public.community_entitled_member_count(uuid) from public;
revoke all on function public.community_entitled_member_count(uuid) from anon;
revoke all on function public.community_entitled_member_count(uuid) from authenticated;
revoke all on function public.community_entitled_member_count(uuid) from service_role;
grant execute on function public.community_entitled_member_count(uuid) to authenticated;
grant execute on function public.community_entitled_member_count(uuid) to service_role;

revoke all on function public.community_revenue_series(uuid, text) from public;
revoke all on function public.community_revenue_series(uuid, text) from anon;
revoke all on function public.community_revenue_series(uuid, text) from authenticated;
revoke all on function public.community_revenue_series(uuid, text) from service_role;
grant execute on function public.community_revenue_series(uuid, text) to authenticated;
grant execute on function public.community_revenue_series(uuid, text) to service_role;

revoke all on function public.create_automation_endpoint(uuid, text, text, text[], boolean, boolean) from public;
revoke all on function public.create_automation_endpoint(uuid, text, text, text[], boolean, boolean) from anon;
revoke all on function public.create_automation_endpoint(uuid, text, text, text[], boolean, boolean) from authenticated;
revoke all on function public.create_automation_endpoint(uuid, text, text, text[], boolean, boolean) from service_role;
grant execute on function public.create_automation_endpoint(uuid, text, text, text[], boolean, boolean) to authenticated;
grant execute on function public.create_automation_endpoint(uuid, text, text, text[], boolean, boolean) to service_role;

revoke all on function public.create_community(text, text, text, text, text, text) from public;
revoke all on function public.create_community(text, text, text, text, text, text) from anon;
revoke all on function public.create_community(text, text, text, text, text, text) from authenticated;
revoke all on function public.create_community(text, text, text, text, text, text) from service_role;
grant execute on function public.create_community(text, text, text, text, text, text) to authenticated;
grant execute on function public.create_community(text, text, text, text, text, text) to service_role;

revoke all on function public.delete_automation_endpoint(uuid) from public;
revoke all on function public.delete_automation_endpoint(uuid) from anon;
revoke all on function public.delete_automation_endpoint(uuid) from authenticated;
revoke all on function public.delete_automation_endpoint(uuid) from service_role;
grant execute on function public.delete_automation_endpoint(uuid) to authenticated;
grant execute on function public.delete_automation_endpoint(uuid) to service_role;

revoke all on function public.ensure_community_chat_thread(uuid) from public;
revoke all on function public.ensure_community_chat_thread(uuid) from anon;
revoke all on function public.ensure_community_chat_thread(uuid) from authenticated;
revoke all on function public.ensure_community_chat_thread(uuid) from service_role;
grant execute on function public.ensure_community_chat_thread(uuid) to authenticated;
grant execute on function public.ensure_community_chat_thread(uuid) to service_role;

revoke all on function public.get_builder_billing_status() from public;
revoke all on function public.get_builder_billing_status() from anon;
revoke all on function public.get_builder_billing_status() from authenticated;
revoke all on function public.get_builder_billing_status() from service_role;
grant execute on function public.get_builder_billing_status() to authenticated;
grant execute on function public.get_builder_billing_status() to service_role;

revoke all on function public.get_community_pricing(uuid) from public;
revoke all on function public.get_community_pricing(uuid) from anon;
revoke all on function public.get_community_pricing(uuid) from authenticated;
revoke all on function public.get_community_pricing(uuid) from service_role;
grant execute on function public.get_community_pricing(uuid) to authenticated;
grant execute on function public.get_community_pricing(uuid) to service_role;

revoke all on function public.get_my_community_access(uuid) from public;
revoke all on function public.get_my_community_access(uuid) from anon;
revoke all on function public.get_my_community_access(uuid) from authenticated;
revoke all on function public.get_my_community_access(uuid) from service_role;
grant execute on function public.get_my_community_access(uuid) to authenticated;
grant execute on function public.get_my_community_access(uuid) to service_role;

revoke all on function public.has_active_entitlement(uuid) from public;
revoke all on function public.has_active_entitlement(uuid) from anon;
revoke all on function public.has_active_entitlement(uuid) from authenticated;
revoke all on function public.has_active_entitlement(uuid) from service_role;
grant execute on function public.has_active_entitlement(uuid) to authenticated;
grant execute on function public.has_active_entitlement(uuid) to service_role;

revoke all on function public.has_active_entitlement_role(uuid, text[]) from public;
revoke all on function public.has_active_entitlement_role(uuid, text[]) from anon;
revoke all on function public.has_active_entitlement_role(uuid, text[]) from authenticated;
revoke all on function public.has_active_entitlement_role(uuid, text[]) from service_role;
grant execute on function public.has_active_entitlement_role(uuid, text[]) to authenticated;
grant execute on function public.has_active_entitlement_role(uuid, text[]) to service_role;

revoke all on function public.is_community_member(uuid) from public;
revoke all on function public.is_community_member(uuid) from anon;
revoke all on function public.is_community_member(uuid) from authenticated;
revoke all on function public.is_community_member(uuid) from service_role;
grant execute on function public.is_community_member(uuid) to authenticated;
grant execute on function public.is_community_member(uuid) to service_role;

revoke all on function public.is_community_owner(uuid) from public;
revoke all on function public.is_community_owner(uuid) from anon;
revoke all on function public.is_community_owner(uuid) from authenticated;
revoke all on function public.is_community_owner(uuid) from service_role;
grant execute on function public.is_community_owner(uuid) to authenticated;
grant execute on function public.is_community_owner(uuid) to service_role;

revoke all on function public.join_public_community(uuid, uuid) from public;
revoke all on function public.join_public_community(uuid, uuid) from anon;
revoke all on function public.join_public_community(uuid, uuid) from authenticated;
revoke all on function public.join_public_community(uuid, uuid) from service_role;
grant execute on function public.join_public_community(uuid, uuid) to authenticated;
grant execute on function public.join_public_community(uuid, uuid) to service_role;

revoke all on function public.leave_community(uuid) from public;
revoke all on function public.leave_community(uuid) from anon;
revoke all on function public.leave_community(uuid) from authenticated;
revoke all on function public.leave_community(uuid) from service_role;
grant execute on function public.leave_community(uuid) to authenticated;
grant execute on function public.leave_community(uuid) to service_role;

revoke all on function public.list_automation_deliveries(uuid, integer) from public;
revoke all on function public.list_automation_deliveries(uuid, integer) from anon;
revoke all on function public.list_automation_deliveries(uuid, integer) from authenticated;
revoke all on function public.list_automation_deliveries(uuid, integer) from service_role;
grant execute on function public.list_automation_deliveries(uuid, integer) to authenticated;
grant execute on function public.list_automation_deliveries(uuid, integer) to service_role;

revoke all on function public.list_automation_endpoints(uuid) from public;
revoke all on function public.list_automation_endpoints(uuid) from anon;
revoke all on function public.list_automation_endpoints(uuid) from authenticated;
revoke all on function public.list_automation_endpoints(uuid) from service_role;
grant execute on function public.list_automation_endpoints(uuid) to authenticated;
grant execute on function public.list_automation_endpoints(uuid) to service_role;

revoke all on function public.list_community_members_admin(uuid) from public;
revoke all on function public.list_community_members_admin(uuid) from anon;
revoke all on function public.list_community_members_admin(uuid) from authenticated;
revoke all on function public.list_community_members_admin(uuid) from service_role;
grant execute on function public.list_community_members_admin(uuid) to authenticated;
grant execute on function public.list_community_members_admin(uuid) to service_role;

revoke all on function public.list_pending_purchase_claims() from public;
revoke all on function public.list_pending_purchase_claims() from anon;
revoke all on function public.list_pending_purchase_claims() from authenticated;
revoke all on function public.list_pending_purchase_claims() from service_role;
grant execute on function public.list_pending_purchase_claims() to authenticated;
grant execute on function public.list_pending_purchase_claims() to service_role;

revoke all on function public.redeem_pending_purchase_claims() from public;
revoke all on function public.redeem_pending_purchase_claims() from anon;
revoke all on function public.redeem_pending_purchase_claims() from authenticated;
revoke all on function public.redeem_pending_purchase_claims() from service_role;
grant execute on function public.redeem_pending_purchase_claims() to authenticated;
grant execute on function public.redeem_pending_purchase_claims() to service_role;

revoke all on function public.redeem_purchase_claim(text) from public;
revoke all on function public.redeem_purchase_claim(text) from anon;
revoke all on function public.redeem_purchase_claim(text) from authenticated;
revoke all on function public.redeem_purchase_claim(text) from service_role;
grant execute on function public.redeem_purchase_claim(text) to authenticated;
grant execute on function public.redeem_purchase_claim(text) to service_role;

revoke all on function public.remove_member(uuid, uuid) from public;
revoke all on function public.remove_member(uuid, uuid) from anon;
revoke all on function public.remove_member(uuid, uuid) from authenticated;
revoke all on function public.remove_member(uuid, uuid) from service_role;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to service_role;

revoke all on function public.rotate_automation_endpoint_secret(uuid) from public;
revoke all on function public.rotate_automation_endpoint_secret(uuid) from anon;
revoke all on function public.rotate_automation_endpoint_secret(uuid) from authenticated;
revoke all on function public.rotate_automation_endpoint_secret(uuid) from service_role;
grant execute on function public.rotate_automation_endpoint_secret(uuid) to authenticated;
grant execute on function public.rotate_automation_endpoint_secret(uuid) to service_role;

revoke all on function public.save_community_settings(uuid, text, text, text, text, text, text, numeric, numeric, text, smallint) from public;
revoke all on function public.save_community_settings(uuid, text, text, text, text, text, text, numeric, numeric, text, smallint) from anon;
revoke all on function public.save_community_settings(uuid, text, text, text, text, text, text, numeric, numeric, text, smallint) from authenticated;
revoke all on function public.save_community_settings(uuid, text, text, text, text, text, text, numeric, numeric, text, smallint) from service_role;
grant execute on function public.save_community_settings(uuid, text, text, text, text, text, text, numeric, numeric, text, smallint) to authenticated;
grant execute on function public.save_community_settings(uuid, text, text, text, text, text, text, numeric, numeric, text, smallint) to service_role;

revoke all on function public.set_member_role(uuid, uuid, text) from public;
revoke all on function public.set_member_role(uuid, uuid, text) from anon;
revoke all on function public.set_member_role(uuid, uuid, text) from authenticated;
revoke all on function public.set_member_role(uuid, uuid, text) from service_role;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to service_role;

revoke all on function public.update_automation_endpoint(uuid, text, text, boolean, text[], boolean) from public;
revoke all on function public.update_automation_endpoint(uuid, text, text, boolean, text[], boolean) from anon;
revoke all on function public.update_automation_endpoint(uuid, text, text, boolean, text[], boolean) from authenticated;
revoke all on function public.update_automation_endpoint(uuid, text, text, boolean, text[], boolean) from service_role;
grant execute on function public.update_automation_endpoint(uuid, text, text, boolean, text[], boolean) to authenticated;
grant execute on function public.update_automation_endpoint(uuid, text, text, boolean, text[], boolean) to service_role;

revoke all on function public.user_has_active_entitlement(uuid, uuid) from public;
revoke all on function public.user_has_active_entitlement(uuid, uuid) from anon;
revoke all on function public.user_has_active_entitlement(uuid, uuid) from authenticated;
revoke all on function public.user_has_active_entitlement(uuid, uuid) from service_role;
grant execute on function public.user_has_active_entitlement(uuid, uuid) to authenticated;
grant execute on function public.user_has_active_entitlement(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Authenticated-only (explicitly exclude service_role)
-- -----------------------------------------------------------------------------

revoke all on function public.delete_brandos_connector(uuid) from public;
revoke all on function public.delete_brandos_connector(uuid) from anon;
revoke all on function public.delete_brandos_connector(uuid) from authenticated;
revoke all on function public.delete_brandos_connector(uuid) from service_role;
grant execute on function public.delete_brandos_connector(uuid) to authenticated;

revoke all on function public.get_brandos_connector(uuid) from public;
revoke all on function public.get_brandos_connector(uuid) from anon;
revoke all on function public.get_brandos_connector(uuid) from authenticated;
revoke all on function public.get_brandos_connector(uuid) from service_role;
grant execute on function public.get_brandos_connector(uuid) to authenticated;

revoke all on function public.upsert_brandos_connector(uuid, text, uuid, text, boolean) from public;
revoke all on function public.upsert_brandos_connector(uuid, text, uuid, text, boolean) from anon;
revoke all on function public.upsert_brandos_connector(uuid, text, uuid, text, boolean) from authenticated;
revoke all on function public.upsert_brandos_connector(uuid, text, uuid, text, boolean) from service_role;
grant execute on function public.upsert_brandos_connector(uuid, text, uuid, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Server-only (service_role)
-- -----------------------------------------------------------------------------

revoke all on function public.automation_dequeue_events(integer) from public;
revoke all on function public.automation_dequeue_events(integer) from anon;
revoke all on function public.automation_dequeue_events(integer) from authenticated;
revoke all on function public.automation_dequeue_events(integer) from service_role;
grant execute on function public.automation_dequeue_events(integer) to service_role;

revoke all on function public.automation_enqueue_event(uuid, text, jsonb, text) from public;
revoke all on function public.automation_enqueue_event(uuid, text, jsonb, text) from anon;
revoke all on function public.automation_enqueue_event(uuid, text, jsonb, text) from authenticated;
revoke all on function public.automation_enqueue_event(uuid, text, jsonb, text) from service_role;
grant execute on function public.automation_enqueue_event(uuid, text, jsonb, text) to service_role;

revoke all on function public.automation_finalize_event(uuid, boolean, text) from public;
revoke all on function public.automation_finalize_event(uuid, boolean, text) from anon;
revoke all on function public.automation_finalize_event(uuid, boolean, text) from authenticated;
revoke all on function public.automation_finalize_event(uuid, boolean, text) from service_role;
grant execute on function public.automation_finalize_event(uuid, boolean, text) to service_role;

revoke all on function public.automation_get_endpoint_for_manage(uuid, uuid) from public;
revoke all on function public.automation_get_endpoint_for_manage(uuid, uuid) from anon;
revoke all on function public.automation_get_endpoint_for_manage(uuid, uuid) from authenticated;
revoke all on function public.automation_get_endpoint_for_manage(uuid, uuid) from service_role;
grant execute on function public.automation_get_endpoint_for_manage(uuid, uuid) to service_role;

revoke all on function public.automation_list_delivery_endpoints(uuid, text) from public;
revoke all on function public.automation_list_delivery_endpoints(uuid, text) from anon;
revoke all on function public.automation_list_delivery_endpoints(uuid, text) from authenticated;
revoke all on function public.automation_list_delivery_endpoints(uuid, text) from service_role;
grant execute on function public.automation_list_delivery_endpoints(uuid, text) to service_role;

revoke all on function public.automation_record_delivery(uuid, uuid, text, integer, integer, text) from public;
revoke all on function public.automation_record_delivery(uuid, uuid, text, integer, integer, text) from anon;
revoke all on function public.automation_record_delivery(uuid, uuid, text, integer, integer, text) from authenticated;
revoke all on function public.automation_record_delivery(uuid, uuid, text, integer, integer, text) from service_role;
grant execute on function public.automation_record_delivery(uuid, uuid, text, integer, integer, text) to service_role;

revoke all on function public.automation_worker_secret() from public;
revoke all on function public.automation_worker_secret() from anon;
revoke all on function public.automation_worker_secret() from authenticated;
revoke all on function public.automation_worker_secret() from service_role;
grant execute on function public.automation_worker_secret() to service_role;

revoke all on function public.clear_user_provider_key_secret(uuid, text) from public;
revoke all on function public.clear_user_provider_key_secret(uuid, text) from anon;
revoke all on function public.clear_user_provider_key_secret(uuid, text) from authenticated;
revoke all on function public.clear_user_provider_key_secret(uuid, text) from service_role;
grant execute on function public.clear_user_provider_key_secret(uuid, text) to service_role;

revoke all on function public.edge_rate_limit_allow(text, integer, integer) from public;
revoke all on function public.edge_rate_limit_allow(text, integer, integer) from anon;
revoke all on function public.edge_rate_limit_allow(text, integer, integer) from authenticated;
revoke all on function public.edge_rate_limit_allow(text, integer, integer) from service_role;
grant execute on function public.edge_rate_limit_allow(text, integer, integer) to service_role;

revoke all on function public.ensure_community_bootstrap(uuid) from public;
revoke all on function public.ensure_community_bootstrap(uuid) from anon;
revoke all on function public.ensure_community_bootstrap(uuid) from authenticated;
revoke all on function public.ensure_community_bootstrap(uuid) from service_role;
grant execute on function public.ensure_community_bootstrap(uuid) to service_role;

revoke all on function public.read_user_provider_key_secret(uuid, text, boolean) from public;
revoke all on function public.read_user_provider_key_secret(uuid, text, boolean) from anon;
revoke all on function public.read_user_provider_key_secret(uuid, text, boolean) from authenticated;
revoke all on function public.read_user_provider_key_secret(uuid, text, boolean) from service_role;
grant execute on function public.read_user_provider_key_secret(uuid, text, boolean) to service_role;

revoke all on function public.search_user_message_snippets(uuid, text, uuid, integer) from public;
revoke all on function public.search_user_message_snippets(uuid, text, uuid, integer) from anon;
revoke all on function public.search_user_message_snippets(uuid, text, uuid, integer) from authenticated;
revoke all on function public.search_user_message_snippets(uuid, text, uuid, integer) from service_role;
grant execute on function public.search_user_message_snippets(uuid, text, uuid, integer) to service_role;

revoke all on function public.upsert_user_provider_key_secret(uuid, text, text) from public;
revoke all on function public.upsert_user_provider_key_secret(uuid, text, text) from anon;
revoke all on function public.upsert_user_provider_key_secret(uuid, text, text) from authenticated;
revoke all on function public.upsert_user_provider_key_secret(uuid, text, text) from service_role;
grant execute on function public.upsert_user_provider_key_secret(uuid, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- Trigger-only helpers (no grants)
-- -----------------------------------------------------------------------------

revoke all on function public.communities_before_delete_cleanup() from public;
revoke all on function public.communities_before_delete_cleanup() from anon;
revoke all on function public.communities_before_delete_cleanup() from authenticated;
revoke all on function public.communities_before_delete_cleanup() from service_role;

revoke all on function public.enqueue_automation_email_captured_from_receipt() from public;
revoke all on function public.enqueue_automation_email_captured_from_receipt() from anon;
revoke all on function public.enqueue_automation_email_captured_from_receipt() from authenticated;
revoke all on function public.enqueue_automation_email_captured_from_receipt() from service_role;

revoke all on function public.enqueue_automation_member_joined() from public;
revoke all on function public.enqueue_automation_member_joined() from anon;
revoke all on function public.enqueue_automation_member_joined() from authenticated;
revoke all on function public.enqueue_automation_member_joined() from service_role;

revoke all on function public.enqueue_automation_member_left() from public;
revoke all on function public.enqueue_automation_member_left() from anon;
revoke all on function public.enqueue_automation_member_left() from authenticated;
revoke all on function public.enqueue_automation_member_left() from service_role;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;
revoke all on function public.handle_new_user() from service_role;

revoke all on function public.messages_assign_seq() from public;
revoke all on function public.messages_assign_seq() from anon;
revoke all on function public.messages_assign_seq() from authenticated;
revoke all on function public.messages_assign_seq() from service_role;

revoke all on function public.next_thread_seq(uuid) from public;
revoke all on function public.next_thread_seq(uuid) from anon;
revoke all on function public.next_thread_seq(uuid) from authenticated;
revoke all on function public.next_thread_seq(uuid) from service_role;

revoke all on function public.personal_memory_items_dedupe() from public;
revoke all on function public.personal_memory_items_dedupe() from anon;
revoke all on function public.personal_memory_items_dedupe() from authenticated;
revoke all on function public.personal_memory_items_dedupe() from service_role;

