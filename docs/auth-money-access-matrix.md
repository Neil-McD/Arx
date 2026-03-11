# Auth + Money + Access Matrix (Canonical Contract)

Status: active  
Scope: web + mobile, chat + agent, inference + Daytona sandbox entitlement

## 0) Canonical Account Ladder

1. `anonymous free`
   - one local guest thread
   - no ChatGPT auth
   - no OpenRouter key
   - no Polynet inference
2. `authenticated free`
   - no Polynet inference
   - can use ChatGPT auth
   - can use OpenRouter key
   - can join and use communities
3. `builder`
   - authenticated free plus Daytona workbench
   - some Polynet inference
   - no community creation
4. `architect`
   - builder plus community creation, pricing, subscriptions, payouts, and community agent configuration

## 1) Irreducible Contract

The platform behavior is defined by 6 inputs:

1. Surface: `web` | `mobile`
2. Requested execution target: `chat` | `daytona_workspace`
3. Auth state: `anonymous` | `authenticated`
4. Account tier: `free` | `builder` | `architect`
5. Requested funding source: `demo_public` | `user_key` | `user_chatgpt` | `platform`
6. Active community lens: absent | present

And 7 outputs:

1. Runtime lane: `public` | `daytona` | `platform_fallback` | `chatgpt`
2. Resolved funding source: `demo_public` | `user_key` | `user_chatgpt` | `platform`
3. Daytona sandbox entitlement: allowed/denied
4. Platform inference entitlement: allowed/denied
5. Entitled capability families: `[]` | `["community_tools"]` | `["community_tools","coding_tools"]`
6. Community action mode: `join_free` | `request_access` | `checkout`
7. Community create entitlement: allowed/denied

## 2) Canonical Routing + Gating Rules

1. Server decides lane. Clients request a turn; they do not authoritatively choose execution backend.
2. `runtime_turn` is the canonical authenticated cloud runtime entrypoint.
2a. Non-community cloud threads must be project-bound (`project_id` required). The server auto-assigns `General` where needed.
3. Funding source, not price class, decides who pays for inference.
4. `demo_public` is an optional low-reliability shared lane, not the default authenticated free strategy.
5. Daytona sandbox is workbench-tier only:
   - `free`: never create or use Daytona sandbox
   - `builder`: Daytona sandbox allowed
   - `architect`: Daytona sandbox allowed
6. `requested_execution_target=daytona_workspace` routes to `daytona` only when paid platform compute is present.
6a. `requested_execution_target=daytona_workspace` remains the only path into Daytona and the coding harness.
6b. Authenticated chat-target turns may still use the community harness tools when an active community lens is present. That community tool loop does not imply Daytona entitlement.
6c. Capability entitlements are tier-based:
   - anonymous: `[]`
   - authenticated free: `["community_tools"]`
   - builder / architect: `["community_tools","coding_tools"]`
6d. Active run capability families are run-specific:
   - authenticated cloud chat with no active community lens: `[]`
   - authenticated cloud chat with an active community lens: `["community_tools"]`
   - Daytona workspace with no active community lens: `["coding_tools"]`
   - Daytona workspace with an active community lens: `["community_tools","coding_tools"]`
7. Chat-only turns may route to:
   - `public` for `demo_public`
   - `platform_fallback` for `platform`
   - `platform_fallback` for `user_key` because the cloud runtime substrate is the same even though the funding source differs
   - `chatgpt` for `user_chatgpt`
8. ChatGPT auth is a user-funded lane and does not imply Daytona entitlement.
9. Community creation remains architect-tier-gated.
10. Authenticated free never receives Polynet-funded inference; it must route through `user_chatgpt` or `user_key`.

## 3) Behavior Matrix (Phase 1)

| Surface | Lane | Auth | Tier | Requested funding source | requested_execution_target | Runtime lane | Resolved funding source | Daytona sandbox | Platform inference | Community create |
|---|---|---|---|---|---|---|---|---|---|
| Web/Mobile | Chat | anonymous | n/a | `demo_public` | `chat` | `public` | `demo_public` | denied | denied | denied |
| Web/Mobile | Chat | anonymous | n/a | `user_key` / `user_chatgpt` / `platform` | any | denied (`auth_required`) | denied | denied | denied |
| Web/Mobile | Chat | authenticated | free | `demo_public` | `chat` | `public` | `demo_public` | denied | denied | denied |
| Web/Mobile | Chat | authenticated | free | `user_key` | `chat` | `platform_fallback` | `user_key` | denied | denied | denied |
| Web/Mobile | Chat | authenticated | free | `user_chatgpt` | `chat` | `chatgpt` | `user_chatgpt` | denied | denied | denied |
| Web/Mobile | Chat | authenticated | free | `platform` | `chat` | `chatgpt` or `platform_fallback` when user-funded provider is connected, otherwise denied (`provider_connection_required`) | `user_chatgpt` or `user_key` | denied | denied | denied |
| Web/Mobile | Chat | authenticated | builder | `platform` | `chat` | `platform_fallback` | `platform` | not required | allowed | denied |
| Web/Mobile | Chat | authenticated | builder | `user_key` | `chat` | `platform_fallback` | `user_key` | not required | allowed | denied |
| Web/Mobile | Chat | authenticated | builder | `user_chatgpt` | `chat` | `chatgpt` | `user_chatgpt` | not required | allowed | denied |
| Web/Mobile | Chat | authenticated | builder | any | `daytona_workspace` | `daytona` | `platform` | allowed | allowed | denied |
| Web/Mobile | Chat | authenticated | architect | `platform` | `chat` | `platform_fallback` | `platform` | not required | allowed | allowed |
| Web/Mobile | Chat | authenticated | architect | `user_key` | `chat` | `platform_fallback` | `user_key` | not required | allowed | allowed |
| Web/Mobile | Chat | authenticated | architect | `user_chatgpt` | `chat` | `chatgpt` | `user_chatgpt` | not required | allowed | allowed |
| Web/Mobile | Chat | authenticated | architect | any | `daytona_workspace` | `daytona` | `platform` | allowed | allowed | allowed |

Notes:
- `daytona` is only for paid tiers and only when tool-capable execution is requested.
- Authenticated cloud chat with an active community lens may enter the community harness loop while staying on its resolved inference lane (`public`, `platform_fallback`, or `chatgpt`).
- `runtimeRuns` should persist `requestedExecutionTarget`, active capability families, and harness profile.
- Phase 2 runtime detail: `daytona` now provisions/reuses a Daytona sandbox and executes a toolbox probe command (`pwd`) before response completion.
- Assistant response generation uses the Convex runtime endpoints (`/runtime/public_turn`, `/runtime/runtime_turn`).
- Client wiring gate: `VITE_ENABLE_RUNTIME_TURN_V2=true` keeps authenticated cloud turns on the canonical `runtime_turn` path.
- Community join mode remains server-authored (`join_free` / `request_access` / `checkout`).

## 4) Canonical Files (Source of Truth)

- Contract + matrix:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-money-access-matrix.md`
- Runtime endpoint:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpRuntimeRoutes.ts` (`/runtime/runtime_turn`)
- Existing inference endpoints:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpRuntimeRoutes.ts` (`/runtime/public_turn`)
- Entitlement + model routing helpers:
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/modelRegistry.ts`
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts`
  - `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/modelCatalog.ts`

## 5) Drift Policy

Any change to tier semantics, runtime lane routing, or sandbox entitlement must:

1. Update this matrix doc.
2. Keep matrix contract checks green.
3. Keep runtime endpoint tests green for:
   - free denied for Daytona
   - paid allowed for Daytona
   - user-funded chat-only lanes do not imply paid Daytona access
   - idempotent run creation and replay behavior
