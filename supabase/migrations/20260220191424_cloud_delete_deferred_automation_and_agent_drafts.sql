-- Remove deferred automation trigger and unused community agent draft lane.
-- This migration is intentionally destructive and production-scoped.

drop function if exists public.community_automation_trigger(uuid, text, jsonb, text);

drop function if exists public.list_community_agent_drafts(uuid);
drop function if exists public.upsert_community_agent_draft(uuid, integer, text, jsonb, text);
drop function if exists public.set_active_community_agent_draft(uuid, integer);
drop function if exists public.get_active_community_agent_system_prompt(uuid, uuid);
drop function if exists public.get_active_community_agent_landing(uuid);

drop table if exists public.community_agent_drafts cascade;

drop function if exists public.dev_set_my_builder_tier(text);;
