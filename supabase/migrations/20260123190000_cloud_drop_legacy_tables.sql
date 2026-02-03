-- Remove legacy/unused tables that are no longer part of the MVP contract.
-- (Kept as DROP IF EXISTS so fresh DBs remain reproducible.)

-- Legacy community chat (replaced by threads/messages)
drop function if exists public.community_chat_messages_mirror_to_messages();
drop table if exists public.community_chat_messages;

-- Deprecated artifact model (replaced by community_resources)
drop table if exists public.artifacts cascade;
drop table if exists public.artifact_versions cascade;

-- Unused DM prototype tables
drop table if exists public.dms_threads cascade;
drop table if exists public.dms_participants cascade;
drop table if exists public.dms_messages cascade;

-- Unused repo mirror prototype table
drop table if exists public.repo_mirrors cascade;
