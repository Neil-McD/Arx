# MVP Boundary Ledger (PolyNet.ai)

Date: 2026-02-12  
Scope: `.worktrees/mvp`  
Source contract: `AGENTS.md`
Status: `Frozen` (update only when an explicit MVP boundary decision is made)

This ledger freezes current MVP boundaries using three labels:

- `KEEP`: required for MVP behavior now.
- `DELETE`: safe to remove with high confidence.
- `DECISION`: likely removable or refactor-worthy, but needs explicit product/ops choice first.

Execution notes:
- Wave A function-surface deletions executed.
- Affiliate runtime retirement executed via forward migration.
- Funnel lead surface retirement executed via forward migration (funnel config retained).
- Unused edge shared helpers removed: `supabase/functions/_shared/edge_fetch.ts`, `supabase/functions/_shared/worker_auth.ts`.
- Dead frontend helper export removed: `formatAutomationDeliveryError` from `shared/chatUi.ts`.
- Historical Wave A execution doc retired; this ledger is the canonical MVP boundary source.
- Assistant/thread fallback writes now route through strict `append_event` contract path.
- Legacy DB bypass API `db::add_message` removed; regression guard added at `scripts/db_write_path_contract_guard.sh`.
- Workspace scope identity now uses fingerprint-first semantics with canonical-path fallback for legacy threads.
- Workspace identity regression guard added at `scripts/workspace_identity_contract_guard.sh`.
- Invite lifecycle command parity closed: `mark_pending_invite_expired_cmd` implemented and registered in invoke surface.
- Legacy no-op desktop tool-policy surface removed:
  - backend commands `list_tools_cmd`, `respond_permission_cmd`, `classify_command_cmd`;
  - frontend/controller compatibility paths (`useDesktopToolPolicyAutomation`, old `respondPermission` wiring);
  - stale regression guard `scripts/desktop_tool_policy_automation_regression_check.sh`.
- Contract guards aligned to reduced surface:
  - `scripts/main_rs_runtime_thread_cluster_boundary_check.sh`
  - `scripts/main_rs_message_settings_cluster_boundary_check.sh`
  - `scripts/desktop_tool_approval_controller_regression_check.sh`
  - `scripts/desktop_send_flow_controller_regression_check.sh`
- Added local process hygiene control script for deterministic dev cleanup:
  - `scripts/dev_process_hygiene.sh` (status by default; explicit kill flags only).
- Supabase tooling/drift contract pinned and guarded:
  - `scripts/supabase_cli_contract_check.sh`
  - `scripts/supabase_migration_filename_guard.sh`
  - `docs/release/supabase-tooling-contract.md`
- Decision-sensitive deletion review (with UX impact) captured in:
  - `docs/mvp-decision-removals-ux.md`
- 8-readiness snapshot now tracked in:
  - `docs/eight-readiness-scorecard.md`

---

## 1) Features

### KEEP
- Auth/session lifecycle (web + desktop session handoff).
- Community create/manage flows.
- Visibility semantics `Published` + `Unlisted` with gated access.
- Public community landing/gate flow (`/c/:slug`).
- Discover feed.
- Core member loop: join, navigate, chat/post, voice.
- Billing + provider/account connections.
- Automated builder payouts.
- Personal AI threads + community lens switching inside thread.
- Community resources/memory primitives and harness/tooling.

### DELETE
- Affiliate program as launch scope.
- Affiliate payout automation.
- Advanced automations/workflow depth beyond alpha-minimal needs.
- Duplicate legacy UI surfaces not needed for core journeys.

### DECISION
- Keep minimal request-access flow as part of gated join (`community_join_requests`) vs strict paid-only gate.
- Keep community funnel config/lead schema vs hard-disable at DB layer.

---

## 2) Routes / Entry Surfaces

Evidence: `apps/web/src/App.tsx` route parsing and route state.

### KEEP
- `/c/:slug` (`community_landing`) — canonical founder-shareable landing.
- `/checkout/success` (`checkout_success`) — idempotent post-payment UX.
- `/claim` (`claim`) — purchase claim/recovery bridge.
- App shell hash routes (`#page=workspace|community|discover`).

### DELETE
- None yet executed from route layer in this pass.

### DECISION
- Deep-link helper surface around short redirect (`c` edge-function namespace) can be removed if `/c/:slug` remains canonical and desktop claim links keep working.

---

## 3) Edge Functions (`supabase/functions`)

### KEEP (active first-party call path)
- `agent_turn` (used by app inference flow).
- `checkout_start` (checkout entry).
- `checkout_finalize` (idempotent finalize/status flow).
- `stripe_webhook` (authoritative payment finalization).
- `public_funnel` (community landing resolve/checkout).
- `public_discover` (discover feed).
- `public_turn` (guest/public turn flow).
- `builder_checkout_start` (builder subscriptions).
- `builder_billing_portal` (builder billing management).
- `connect_onboard_start` (provider connect onboarding).
- `platform_agent_infer` (platform-level inference quotas/routing).
- `voice_transcribe` (voice UX path).

### DELETE (high confidence)
- `supabase/functions/affiliate_worker/` (empty dir; no first-party call path).
- `supabase/functions/automations_worker/` (empty dir; no first-party call path).
- `supabase/functions/automations_test/` (empty dir; no first-party call path).
- `supabase/functions/public_chat_preview/` (empty dir; legacy only).
- `supabase/functions/public_community/` (empty dir; legacy only).
- `supabase/functions/c/` (empty dir; no runtime implementation in repo).

### DECISION
- Automation surface should be reduced to BrandOS/external-landing integration only; broad automation expansion remains deferred.
- Any residual automation RPC dependencies referenced from harness action surfaces should be reconciled before DB cleanup.

---

## 4) Desktop Commands (`src-tauri/src/commands` + registry)

Evidence: `src-tauri/src/invoke_registry.rs`.

### KEEP
- Runtime/thread commands (`submit_turn_cmd`, event list/get, tool approval flow).
- Thread metadata commands (`set_thread_context_cmd`, title/workspace/engine).
- Workspace/project commands.
- Settings/model/approval commands.
- Voice capture commands.
- Attachment ingestion.
- Pending invite lifecycle (`list/upsert/dismiss/request_join/mark_joined/mark_expired`).

### DELETE
- No-op/compat command surface removed (high confidence):
  - `list_tools_cmd`
  - `respond_permission_cmd`
  - `classify_command_cmd`
- Legacy no-op desktop policy automation removed:
  - `src/controllers/desktop/useDesktopToolPolicyAutomation.ts`
  - `scripts/desktop_tool_policy_automation_regression_check.sh`

### DECISION
- Keep `get_exec_policy_rules_cmd`/`set_exec_policy_rules_cmd` as user-facing policy settings surface vs removing it from MVP.

---

## 5) Data Layer (Cloud Tables / Migration Surface)

### KEEP (MVP-critical tables)
- Community/auth/access: `communities`, `community_memberships`, `entitlements`, `community_join_requests`.
- Discovery/content: `community_resources`.
- Cognition: `threads`, `messages`, `message_reactions`.
- Personal memory/config: `personal_memory_items`, `user_memory_settings`, `user_model_settings`.
- Billing/payments: `plans`, `payment_intents`, `payment_receipts`, `provider_subscriptions`, `purchase_claims`, `payment_provider_events`, `payment_ledger_entries`.
- Builder payouts/connections: `builder_accounts`, `builder_subscriptions`.
- Quotas: `user_ai_history_usage`, `user_platform_inference_usage`.

### DELETE (scope target, not executed in this pass)
- Affiliate schema family: `affiliate_program_config`, `affiliate_codes`, `affiliate_referrals`, `affiliate_payouts`, `affiliate_ledger_entries`. (executed via `20260213010000_cloud_remove_affiliate_runtime.sql`)
- Funnel leads surface: `community_funnel_leads` + lead-capture/list RPCs. (executed via `20260213013000_cloud_drop_funnel_leads.sql`)

### DECISION
- Automation schema family (`automation_endpoints`, `automation_events`, `automation_deliveries`) — keep minimal BrandOS/external webhook integration vs full removal.
- Funnel config table (`community_funnel_configs`) remains in MVP to support external funnel builders.
- Legacy migration history artifacts should not be physically deleted unless a clean squash/baseline strategy is approved.

---

## 6) Docs and Contracts

### KEEP
- `AGENTS.md` (new MVP contract, vision + scope + invariants).
- `docs/community-lens-contract.md`.
- `docs/thread-domains-contract.md`.
- `docs/community-funnel-contract.md` (single landing/gate contract).

### DELETE
- `docs/mvp-wave-a-high-confidence-deletions.md` (retired execution log; superseded by this ledger).

### DECISION
- Old release snapshots under `docs/release/*` can be archived to `docs/archive/` once migration/tooling strategy is finalized.

---

## 7) Current Priority Order

1. Keep fingerprint-first workspace identity contract stable (`workspace_scope_id` must prefer fingerprint and only fallback to canonical path).
2. Keep strict event-write contract as the only path (`append_event` + provenance validation), and reject bypass reintroduction.
3. Continue monolith extraction with ratchets (`src/App.tsx`, `apps/web/src/App.tsx`, `src-tauri/src/main.rs`, `src-tauri/src/db.rs`), no behavior rewrites.
4. Reduce deferred automation surface to minimal BrandOS/external webhook semantics, then execute forward-only DB cleanup.
5. Keep schema/tooling reproducible (pinned local tooling + migration drift checks) and keep `community_core_check` green on every wave.
