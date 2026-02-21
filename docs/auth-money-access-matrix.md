# Auth + Money + Access Matrix (Canonical Contract)

Status: active  
Scope: web + desktop, chat + agent, inference + commerce + community access

## 1) Irreducible Contract

The platform behavior is defined by 5 inputs:

1. Surface: `web` | `desktop`
2. Lane: `chat` | `agent`
3. Auth state: `anonymous` | `authenticated`
4. Builder tier: `free` | `builder` | `pro`
5. Model class: `free_model` | `paid_model`

And 4 outputs:

1. Inference lane: `chatgpt_cloud_turn` | `public_turn` | `agent_turn` | `platform_agent_infer`
2. Platform inference entitlement: allowed/denied
3. Community action mode: `join_free` | `request_access` | `checkout`
4. Community create entitlement: allowed/denied

## 2) Canonical Routing + Gating Rules

1. Free models route to public inference lane.
2. Desktop cloud chat paid turns use ordered lane execution:
   - OpenAI aliases with ChatGPT auth: `chatgpt_cloud_turn -> agent_turn -> public_turn`
   - Other paid cases: `agent_turn -> public_turn`
   Web paid turns remain `agent_turn`.
3. Platform inference entitlement is server-authoritative and enforced by plan + quota checks.
4. Community public funnel join mode is server-authored (`join_free` / `request_access` / `checkout`), not client-guessed.
5. Community creation is builder-tier-gated.
6. Desktop domains are fixed:
   - `chat:cloud`
   - `agent:local`

## 3) Behavior Matrix

| Surface | Lane | Auth | Tier | Model class | Expected inference route | Platform inference | Community join | Community create |
|---|---|---|---|---|---|---|---|---|
| Web | Chat | anonymous | n/a | free_model | `public_turn` | denied | gated (auth required) | denied |
| Web | Chat | anonymous | n/a | paid_model | not allowed (fallback to free model selection path) | denied | gated (auth required) | denied |
| Web | Chat | authenticated | free | free_model | `public_turn` | denied | server `join_mode` | denied |
| Web | Chat | authenticated | free | paid_model | `agent_turn` request may occur; server returns `platform_inference_not_allowed` | denied | server `join_mode` | denied |
| Web | Chat | authenticated | builder/pro | free_model | `public_turn` | allowed but not required | server `join_mode` | allowed |
| Web | Chat | authenticated | builder/pro | paid_model | `agent_turn` | allowed | server `join_mode` | allowed |
| Desktop | Chat | anonymous | n/a | free_model | `public_turn` | denied | gated (auth required) | denied |
| Desktop | Chat | anonymous | n/a | paid_model | not allowed (fallback to free selection) | denied | gated (auth required) | denied |
| Desktop | Chat | authenticated | free | free_model | `public_turn` | denied | server `join_mode` | denied |
| Desktop | Chat | authenticated | free | paid_model (OpenAI alias + ChatGPT auth) | `chatgpt_cloud_turn -> agent_turn -> public_turn` | denied | server `join_mode` | denied |
| Desktop | Chat | authenticated | free | paid_model (non-OpenAI or no ChatGPT auth) | `agent_turn -> public_turn` | denied | server `join_mode` | denied |
| Desktop | Chat | authenticated | builder/pro | free_model | `public_turn` | allowed but not required | server `join_mode` | allowed |
| Desktop | Chat | authenticated | builder/pro | paid_model (OpenAI alias + ChatGPT auth) | `chatgpt_cloud_turn -> agent_turn -> public_turn` | allowed | server `join_mode` | allowed |
| Desktop | Chat | authenticated | builder/pro | paid_model (non-OpenAI or no ChatGPT auth) | `agent_turn -> public_turn` | allowed | server `join_mode` | allowed |
| Desktop | Agent | authenticated/anonymous | n/a | free_model | local runtime -> `public_turn` | n/a | n/a | n/a |
| Desktop | Agent | authenticated | free | paid_model (OpenAI alias) | local runtime uses `chatgpt` lane first, then `platform_agent_infer` fallback, then `public_turn` | denied | n/a | n/a |
| Desktop | Agent | authenticated | free | paid_model (non-OpenAI alias) | local runtime attempts `platform_agent_infer`; server returns `platform_inference_not_allowed` | denied | n/a | n/a |
| Desktop | Agent | authenticated | builder/pro | paid_model | local runtime uses `platform_agent_infer` | allowed | n/a | n/a |

Notes:
- Agent lane is local execution and does not imply cloud thread persistence.
- Server remains authoritative on entitlement/quota regardless of client routing intent.
- ChatGPT lane is desktop-only and currently used for OpenAI model aliases when a ChatGPT session is present.

## 4) Canonical Files (Source of Truth)

- Model catalog: `/Users/neilmcdevitt/code/arx/.worktrees/mvp/shared/modelCatalog.ts`
- Lane resolver: `/Users/neilmcdevitt/code/arx/.worktrees/mvp/shared/inferenceLaneResolver.ts`
- Web send + turn runner:
  - `/Users/neilmcdevitt/code/arx/.worktrees/mvp/shared/useWebSendFlowController.ts`
  - `/Users/neilmcdevitt/code/arx/.worktrees/mvp/shared/useWebTurnRunnerController.ts`
- Desktop chat cloud API: `/Users/neilmcdevitt/code/arx/.worktrees/mvp/src/services/thread/createDesktopCloudChatThreadApi.ts`
- Desktop local runtime lane routing: `/Users/neilmcdevitt/code/arx/.worktrees/mvp/src-tauri/src/main.rs`
- Auth core + server verification:
  - `/Users/neilmcdevitt/code/arx/.worktrees/mvp/shared/supabaseAuthCore.ts`
  - `/Users/neilmcdevitt/code/arx/.worktrees/mvp/supabase/functions/_shared/auth.ts`
- Inference functions:
  - `/Users/neilmcdevitt/code/arx/.worktrees/mvp/supabase/functions/public_turn/index.ts`
  - `/Users/neilmcdevitt/code/arx/.worktrees/mvp/supabase/functions/agent_turn/index.ts`
  - `/Users/neilmcdevitt/code/arx/.worktrees/mvp/supabase/functions/platform_agent_infer/index.ts`
- Product state + quotas + access:
  - `/Users/neilmcdevitt/code/arx/.worktrees/mvp/supabase/migrations/20260206001000_cloud_user_product_state_rpc.sql`
  - `/Users/neilmcdevitt/code/arx/.worktrees/mvp/supabase/migrations/20260129224500_cloud_platform_inference_quotas.sql`
  - `/Users/neilmcdevitt/code/arx/.worktrees/mvp/supabase/migrations/20260205200000_cloud_public_funnel_contract.sql`
  - `/Users/neilmcdevitt/code/arx/.worktrees/mvp/supabase/migrations/20260205021017_cloud_free_join_approvals.sql`
  - `/Users/neilmcdevitt/code/arx/.worktrees/mvp/supabase/migrations/20260125001000_cloud_builder_gates.sql`

## 5) Drift Policy

Any change to money, lane routing, tier semantics, or access gating must:

1. Update this matrix doc.
2. Keep `scripts/auth_money_access_matrix_check.sh` green.
3. Keep `npm run check:goal-auth-tier-model` green.
