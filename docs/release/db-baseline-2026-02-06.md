# DB Baseline (Zero-Docker)

- Timestamp: 2026-02-06 18:19:14 UTC
- Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/mvp`
- Branch: `mvp`
- Supabase project: `wknevhbqlorryfunsudk` (`https://wknevhbqlorryfunsudk.supabase.co`)

## What Was Verified

1. Migration parity (local files vs remote applied)
- Local migration files: `97`
- Remote applied migrations: `97`
- First version: `20260121000000`
- Last version: `20260206001000`
- Command used: `supabase migration list --linked --output pretty`

2. Live schema shape (remote)
- Public base tables: `40`
- Public RLS policies: `92`
- Source: MCP SQL on `information_schema.tables` and `pg_policies`

3. Advisor findings snapshot (remote)
- Security findings present, including:
  - `RLS Enabled No Policy` on:
    - `public.automation_deliveries`
    - `public.automation_endpoints`
    - `public.automation_events`
    - `public.edge_rate_limits`
    - `public.user_platform_inference_usage`
    - `public.user_provider_keys`
  - `Function Search Path Mutable` on several public functions.
  - `Extension in Public` (`pg_net`, `pg_trgm`).
- Performance findings present, including:
  - `unindexed_foreign_keys`
  - `auth_rls_initplan`
  - `multiple_permissive_policies`
  - `unused_index`

## Known Limitation (Intentional)

- `supabase db diff --linked` was not executed in this baseline because zero-Docker mode is in effect and this command requires Docker for shadow DB creation.

## Immediate Next Step

- Create one migration batch that addresses highest-signal issues first:
  1. `RLS Enabled No Policy` gaps.
  2. `Function Search Path Mutable` fixes (`SET search_path`).
  3. Highest-impact unindexed FKs on thread/message/community/payment paths.

## Progress Update (same day)

- Added and applied migration:
  - `20260206183000_cloud_hardening_search_path_and_fk_indexes.sql`
- Applied via:
  - `supabase db push --linked`
- Verified post-apply:
  - all newly added indexes exist in remote schema
  - function `proconfig` now includes `search_path=public, pg_temp` for:
    - `platform_inference_standard_cap_for_builder_tier`
    - `random_affiliate_code`
    - `max_communities_for_builder_tier`
    - `max_ai_history_bytes_for_builder_tier`
    - `has_personal_memory_access`
