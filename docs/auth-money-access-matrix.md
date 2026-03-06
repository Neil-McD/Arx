# Auth + Money + Access Matrix (Canonical Contract)

Status: active  
Scope: web + desktop, chat + agent, inference + Daytona sandbox entitlement

## 1) Irreducible Contract

The platform behavior is defined by 6 inputs:

1. Surface: `web` | `desktop` | `mobile`
2. Product lane: `chat` | `agent`
3. Auth state: `anonymous` | `authenticated`
4. Builder tier: `free` | `builder` | `architect`
5. Requested funding source: `demo_public` | `user_key` | `user_chatgpt` | `platform`
6. Turn class: `requires_tools=false` | `requires_tools=true`

And 6 outputs:

1. Runtime lane: `public` | `daytona` | `platform_fallback` | `chatgpt_desktop` (transitional name; now used by web and desktop)
2. Resolved funding source: `demo_public` | `user_key` | `user_chatgpt` | `platform`
3. Daytona sandbox entitlement: allowed/denied
4. Platform inference entitlement: allowed/denied
5. Community action mode: `join_free` | `request_access` | `checkout`
6. Community create entitlement: allowed/denied

## 2) Canonical Routing + Gating Rules

1. Server decides lane. Clients request a turn; they do not authoritatively choose execution backend.
2. `runtime_turn` is the canonical authenticated cloud runtime entrypoint.
2a. Non-community cloud threads must be project-bound (`project_id` required). The server auto-assigns `General` where needed.
3. Funding source, not price class, decides who pays for inference.
4. `demo_public` is an optional low-reliability shared lane, not the default authenticated free strategy.
5. Daytona sandbox is paid-only:
   - `free` tier: never create or use Daytona sandbox
   - `builder` / `architect`: Daytona sandbox allowed
6. Tool-capable turns (`requires_tools=true`) route to `daytona` only when paid platform compute is present.
7. Chat-only turns may route to:
   - `public` for `demo_public`
   - `platform_fallback` for `platform`
   - `platform_fallback` for `user_key` because the cloud runtime substrate is the same even though the funding source differs
   - `chatgpt_desktop` for `user_chatgpt` (web spike + desktop legacy lane share the transitional lane name)
8. ChatGPT auth is a user-funded lane and does not imply Daytona entitlement.
9. Community creation remains builder-tier-gated.

## 3) Behavior Matrix (Phase 1)

| Surface | Lane | Auth | Tier | Requested funding source | requires_tools | Runtime lane | Resolved funding source | Daytona sandbox | Platform inference | Community create |
|---|---|---|---|---|---|---|---|---|---|
| Web/Desktop/Mobile | Chat | anonymous | n/a | `demo_public` | false | `public` | `demo_public` | denied | denied | denied |
| Web/Desktop/Mobile | Chat | anonymous | n/a | `user_key` / `user_chatgpt` / `platform` | any | denied (`auth_required`) | denied | denied | denied |
| Web/Desktop/Mobile | Chat | authenticated | free | `demo_public` | false | `public` | `demo_public` | denied | denied | denied |
| Web/Desktop/Mobile | Chat | authenticated | free | `user_key` | false | `platform_fallback` | `user_key` | denied | denied | denied |
| Web/Desktop | Chat | authenticated | free | `user_chatgpt` | false | `chatgpt_desktop` | `user_chatgpt` | denied | denied | denied |
| Web/Desktop/Mobile | Chat | authenticated | free | `platform` | false | denied (`platform_inference_not_allowed`) | denied | denied | denied |
| Web/Desktop/Mobile | Chat | authenticated | builder/architect | `platform` | false | `platform_fallback` | `platform` | not required | allowed | allowed |
| Web/Desktop/Mobile | Chat | authenticated | builder/architect | `user_key` | false | `platform_fallback` | `user_key` | not required | allowed | allowed |
| Web/Desktop | Chat | authenticated | builder/architect | `user_chatgpt` | false | `chatgpt_desktop` | `user_chatgpt` | not required | allowed | allowed |
| Web/Desktop/Mobile | Chat | authenticated | builder/architect | any | true | `daytona` | `platform` | allowed | allowed | allowed |
| Desktop | Agent | authenticated/anonymous | n/a | any | false | existing local runtime (unchanged in Phase 1) | n/a | n/a | n/a |

Notes:
- `chatgpt_desktop` is still a transitional lane name. The web ChatGPT spike reuses it to avoid churn in the canonical gate contract.
- `daytona` is only for paid tiers and only when tool-capable execution is requested.
- Phase 2 runtime detail: `daytona` now provisions/reuses a Daytona sandbox and executes a toolbox probe command (`pwd`) before response completion.
- Assistant response generation uses the Convex runtime endpoints (`/runtime/public_turn`, `/runtime/platform_agent_infer`).
- Client wiring gate: `VITE_ENABLE_RUNTIME_TURN_V2=true` keeps authenticated cloud turns on the canonical `runtime_turn` path (web + desktop).
- Community join mode remains server-authored (`join_free` / `request_access` / `checkout`).

## 4) Canonical Files (Source of Truth)

- Contract + matrix:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-money-access-matrix.md`
- Runtime endpoint:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpRuntimeRoutes.ts` (`/runtime/runtime_turn`)
- Existing inference endpoints:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpRuntimeRoutes.ts` (`/runtime/public_turn`)
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpRuntimeRoutes.ts` (`/runtime/platform_agent_infer`)
- Entitlement + model routing helpers:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/modelRegistry.ts`
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts`
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
   - user-funded chat-only lanes do not imply paid Daytona access
   - idempotent run creation and replay behavior
