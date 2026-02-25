# Auth + Money + Access Matrix (Canonical Contract)

Status: active  
Scope: web + desktop, chat + agent, inference + Daytona sandbox entitlement

## 1) Irreducible Contract

The platform behavior is defined by 6 inputs:

1. Surface: `web` | `desktop` | `mobile`
2. Lane: `chat` | `agent`
3. Auth state: `anonymous` | `authenticated`
4. Builder tier: `free` | `builder` | `pro`
5. Model class: `free_model` | `paid_model`
6. Turn class: `requires_tools=false` | `requires_tools=true`

And 5 outputs:

1. Runtime lane: `public` | `daytona` | `platform_fallback` | `chatgpt_desktop`
2. Daytona sandbox entitlement: allowed/denied
3. Platform inference entitlement: allowed/denied
4. Community action mode: `join_free` | `request_access` | `checkout`
5. Community create entitlement: allowed/denied

## 2) Canonical Routing + Gating Rules

1. Server decides lane. Clients request a turn; they do not authoritatively choose execution backend.
2. `runtime_turn` is the canonical authenticated cloud runtime entrypoint.
2a. Non-community cloud threads must be project-bound (`project_id` required). The server auto-assigns `General` where needed.
3. Free models may run on `public` lane.
4. Paid models require paid tier entitlement.
5. Daytona sandbox is paid-only:
   - `free` tier: never create or use Daytona sandbox
   - `builder` / `pro`: Daytona sandbox allowed
6. Tool-capable turns (`requires_tools=true`) route to `daytona` when paid entitlement is present.
7. Paid turns without tools (`requires_tools=false`) may route to `platform_fallback`.
8. Desktop ChatGPT auth is an optional desktop-only lane (`chatgpt_desktop`) and does not imply Daytona entitlement.
9. Community creation remains builder-tier-gated.

## 3) Behavior Matrix (Phase 1)

| Surface | Lane | Auth | Tier | Model class | requires_tools | Runtime lane | Daytona sandbox | Platform inference | Community create |
|---|---|---|---|---|---|---|---|---|---|
| Web/Desktop/Mobile | Chat | anonymous | n/a | free_model | false | `public` | denied | denied | denied |
| Web/Desktop/Mobile | Chat | anonymous | n/a | paid_model | any | denied (`auth_required`) | denied | denied | denied |
| Web/Desktop/Mobile | Chat | authenticated | free | free_model | false | `public` | denied | denied | denied |
| Web/Desktop/Mobile | Chat | authenticated | free | free_model | true | denied (`platform_inference_not_allowed`) | denied | denied | denied |
| Web/Desktop/Mobile | Chat | authenticated | free | paid_model | any | denied (`platform_inference_not_allowed`) | denied | denied | denied |
| Web/Desktop/Mobile | Chat | authenticated | builder/pro | free_model | false | `public` | not required | allowed | allowed |
| Web/Desktop/Mobile | Chat | authenticated | builder/pro | paid_model | false | `platform_fallback` | not required | allowed | allowed |
| Web/Desktop/Mobile | Chat | authenticated | builder/pro | free_model/paid_model | true | `daytona` | allowed | allowed | allowed |
| Desktop | Chat | authenticated | free/builder/pro | OpenAI alias + ChatGPT auth | false | optional `chatgpt_desktop` override | free: denied, paid: allowed only when `requires_tools=true` | free: denied, paid: allowed | tier-based |
| Desktop | Agent | authenticated/anonymous | n/a | free_model | false | existing local runtime (unchanged in Phase 1) | n/a | n/a | n/a |

Notes:
- `chatgpt_desktop` is optional and desktop-only.
- `daytona` is only for paid tiers and only when tool-capable execution is requested.
- Phase 2 runtime detail: `daytona` now provisions/reuses a Daytona sandbox and executes a toolbox probe command (`pwd`) before response completion.
- Phase 2 response path detail: assistant response generation still reuses existing `public_turn` (free models) / `platform_agent_infer` (paid models) until remote tool-loop migration is finished.
- Client wiring gate: `VITE_ENABLE_RUNTIME_TURN_V2=true` enables runtime-turn-first routing for authenticated cloud turns (web + desktop) with legacy fallback safety.
- Community join mode remains server-authored (`join_free` / `request_access` / `checkout`).

## 4) Canonical Files (Source of Truth)

- Contract + matrix:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-money-access-matrix.md`
- Runtime endpoint:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/supabase/functions/runtime_turn/index.ts`
- Existing inference endpoints:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/supabase/functions/public_turn/index.ts`
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/supabase/functions/platform_agent_infer/index.ts`
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/supabase/functions/agent_turn/index.ts`
- Entitlement + model routing helpers:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/supabase/functions/_shared/platform_inference_core.ts`
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/modelCatalog.ts`
- Desktop ChatGPT bridge:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/src-tauri/src/commands/auth_invite.rs`

## 5) Drift Policy

Any change to tier semantics, runtime lane routing, or sandbox entitlement must:

1. Update this matrix doc.
2. Keep matrix contract checks green.
3. Keep runtime endpoint tests green for:
   - free denied for Daytona
   - paid allowed for Daytona
   - idempotent run creation and replay behavior
