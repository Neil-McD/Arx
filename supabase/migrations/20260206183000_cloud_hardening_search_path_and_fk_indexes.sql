-- Harden function search_path and add covering indexes for high-signal foreign keys.
-- This batch is intentionally behavior-preserving:
-- - no RLS policy semantic changes
-- - no table/column drops

-- Function search_path hardening (advisor: function_search_path_mutable).
alter function public.platform_inference_standard_cap_for_builder_tier(text)
  set search_path = public, pg_temp;

alter function public.random_affiliate_code(integer)
  set search_path = public, pg_temp;

alter function public.max_communities_for_builder_tier(text)
  set search_path = public, pg_temp;

alter function public.max_ai_history_bytes_for_builder_tier(text)
  set search_path = public, pg_temp;

alter function public.has_personal_memory_access(uuid)
  set search_path = public, pg_temp;

-- Covering indexes for foreign keys (advisor: unindexed_foreign_keys).
create index if not exists idx_affiliate_ledger_entries_payout_id
  on public.affiliate_ledger_entries(payout_id);

create index if not exists idx_automation_endpoints_created_by
  on public.automation_endpoints(created_by);

create index if not exists idx_communities_owner_id
  on public.communities(owner_id);

create index if not exists idx_community_funnel_configs_updated_by
  on public.community_funnel_configs(updated_by);

create index if not exists idx_community_join_requests_decided_by
  on public.community_join_requests(decided_by);

create index if not exists idx_payment_intents_plan_id
  on public.payment_intents(plan_id);

create index if not exists idx_provider_subscriptions_payment_intent_id
  on public.provider_subscriptions(payment_intent_id);

create index if not exists idx_provider_subscriptions_plan_id
  on public.provider_subscriptions(plan_id);

create index if not exists idx_purchase_claims_payment_intent_id
  on public.purchase_claims(payment_intent_id);

create index if not exists idx_threads_community_id
  on public.threads(community_id);
