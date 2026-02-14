# MVP Wave B — Automation Cut Map (Step 2)

Date: 2026-02-12  
Scope: `.worktrees/mvp`

Goal for this step: map exact automation-related cut candidates and prove current first-party call paths before deletion.

## 1) Keep (MVP-required call paths)

These are active in product flows and should stay:

- Public landing/gate + checkout flow:
  - `apps/web/src/controllers/useWebPublicFunnelActions.ts:263`
  - `apps/web/src/controllers/useWebPublicFunnelActions.ts:368`
  - `supabase/functions/public_funnel/index.ts:126`
  - `supabase/functions/checkout_start/index.ts:325`
  - `shared/useCheckoutFinalizeController.ts:81`
- BrandOS attribution token plumbing (`brandos_aid`) for funnel/checkout tracking:
  - `apps/web/src/controllers/useWebPublicFunnelActions.ts:94`
  - `shared/pay_first.ts:50`
  - `shared/supabaseAuthIntent.ts:34`
  - `src/App.tsx:3811`

Notes:
- This is attribution plumbing, not full automations runtime.
- Keep this intact unless replacing with a different attribution contract.

## 2) No first-party call path found (cut candidates)

Repository scan of `src`, `apps/web`, and `shared` found no runtime references to:
- `list_automation_endpoints`
- `list_automation_deliveries`
- `create_automation_endpoint`
- `update_automation_endpoint`
- `delete_automation_endpoint`
- `rotate_automation_endpoint_secret`
- `upsert_brandos_connector`
- `delete_brandos_connector`
- `get_brandos_connector`

Current `supabase/functions` also has no automations worker/test functions:
- present function dirs are only core MVP edges (`agent_turn`, checkout/billing/connect, `public_funnel`, discover, `public_turn`, `voice_transcribe`).

## 3) Database/runtime surfaces currently left as deferred fat

These are migration-defined automation surfaces with no app/runtime caller today:

- Tables:
  - `public.automation_endpoints`
  - `public.automation_events`
  - `public.automation_deliveries`
  - origin: `supabase/migrations/20260126171353_cloud_community_automations.sql:10`
- Endpoint management RPCs:
  - `list_automation_endpoints`, `create_automation_endpoint`, `update_automation_endpoint`, `rotate_automation_endpoint_secret`, `delete_automation_endpoint`, `list_automation_deliveries`
  - origin: `supabase/migrations/20260126171353_cloud_community_automations.sql:167`
- BrandOS connector RPCs:
  - `get_brandos_connector`, `upsert_brandos_connector`, `delete_brandos_connector`
  - origin: `supabase/migrations/20260126210446_cloud_brandos_connector_primitives.sql:267`
- Worker scheduler/runtime RPCs:
  - `automation_worker_secret`, `automation_set_project_url`, `automation_enable_worker`
  - origin: `supabase/migrations/20260126191415_cloud_automations_worker_schedule.sql:29`

## 4) Keep by decision (even if not yet wired)

Per MVP direction, keep funnel configuration primitives:
- table/functions from `supabase/migrations/20260205203000_cloud_community_funnel_configs.sql:1`

Note:
- No current first-party caller was found for `get_community_funnel_config`, `save_community_funnel_config`, or `get_public_community_funnel_config_by_slug`.
- This is a deliberate keep for planned external-funnel support, not current runtime necessity.

## 5) Risk notes before deletion

- If automation tables/triggers are dropped, BrandOS attribution may still be captured in checkout/public-funnel tracking, but no automation event pipeline will consume it.
- If this is acceptable for MVP (attribution only, no outbound automation delivery), deletion is safe.
- If outbound BrandOS delivery is required now, keep minimal connector + event delivery path and drop only the rest.

## 6) Exact cut set for Step 3 (forward migration only)

Proposed deletion target (DB/runtime only):

1. Drop membership/payment automation triggers and enqueue functions.
2. Drop automation endpoint/delivery management RPCs.
3. Drop worker scheduler functions.
4. Drop automation tables (`automation_deliveries`, `automation_events`, `automation_endpoints`) in dependency order.
5. Keep:
   - `public_funnel`/`checkout_start` tracking contract
   - `community_funnel_configs`
   - MVP join/gate/billing/thread-lens flows.
