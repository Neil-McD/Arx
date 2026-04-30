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
   - gets web research and community tools
3. `builder`
   - authenticated free plus Daytona workbench
   - some Polynet inference
   - community creation, pricing, subscriptions, payouts, and community agent configuration

## 1) Irreducible Contract

The platform behavior is defined by 6 inputs:

1. Surface: `web` | `mobile`
2. Funding source request: `demo_public` | `platform` | `user_key` | `user_chatgpt`
3. Auth state: `anonymous` | `authenticated`
4. Account tier: `free` | `builder`
5. Active project context: absent | present
6. Active community lens: absent | present

And 7 outputs:

1. Runtime lane: `public` | `platform` | `chatgpt`
2. Resolved funding source: `demo_public` | `user_key` | `user_chatgpt` | `platform`
3. Workspace tool entitlement: allowed/denied
4. Platform inference entitlement: allowed/denied
5. Entitled capability families: `[]` | `["community_tools","web_research"]` | `["community_tools","web_research","workspace_tools"]`
6. Community funnel action: `join` | `request_access` | `checkout`
7. Community create entitlement: allowed/denied

## 2) Canonical Routing + Gating Rules

1. Server decides lane. Clients do not authoritatively choose execution backend.
2. `runtime_turn` is the canonical authenticated cloud runtime entrypoint.
2a. Non-community cloud threads must be project-bound (`project_id` required). The server auto-assigns `General` where needed.
3. Funding source, not price class, decides who pays for inference.
4. `demo_public` is an optional low-reliability shared lane, not the default authenticated free strategy.
5. Workspace tools are workbench-tier only:
   - `free`: never receives `workspace_tools`
   - `builder`: `workspace_tools` allowed
6. Capability entitlements are tier-based:
   - anonymous: `[]`
   - authenticated free: `["community_tools","web_research"]`
   - builder: `["community_tools","web_research","workspace_tools"]`
7. Active run capability families are run-specific:
   - authenticated cloud chat with no active community lens: `["web_research"]`
   - authenticated cloud chat with an active community lens: `["community_tools","web_research"]`
   - project-bound builder run: `["community_tools","web_research","workspace_tools"]` when a community lens is active, otherwise `["web_research","workspace_tools"]`
8. Chat turns may route to:
   - `public` for `demo_public`
   - `platform` for `platform`
   - `platform` for `user_key` because the cloud runtime substrate is the same even though the funding source differs
   - `chatgpt` for `user_chatgpt`
9. ChatGPT auth is a user-funded lane and does not imply workspace entitlement.
10. Community creation remains builder-tier-gated.
11. Authenticated free never receives Polynet-funded inference; it must route through `user_chatgpt` or `user_key`.

## 3) Behavior Matrix (Phase 1)

| Surface | Lane | Auth | Tier | Requested funding source | Active project context | Runtime lane | Resolved funding source | Workspace tools | Platform inference | Community create |
|---|---|---|---|---|---|---|---|---|---|
| Web/Mobile | Chat | anonymous | n/a | `demo_public` | absent | `public` | `demo_public` | denied | denied | denied |
| Web/Mobile | Chat | anonymous | n/a | `user_key` / `user_chatgpt` / `platform` | any | denied (`auth_required`) | denied | denied | denied |
| Web/Mobile | Chat | authenticated | free | `demo_public` | absent | `public` | `demo_public` | denied | denied | denied |
| Web/Mobile | Chat | authenticated | free | `user_key` | absent | `platform` | `user_key` | denied | denied | denied |
| Web/Mobile | Chat | authenticated | free | `user_chatgpt` | absent | `chatgpt` | `user_chatgpt` | denied | denied | denied |
| Web/Mobile | Chat | authenticated | free | `platform` | absent | `chatgpt` or `platform` when user-funded provider is connected, otherwise denied (`provider_connection_required`) | `user_chatgpt` or `user_key` | denied | denied | denied |
| Web/Mobile | Chat | authenticated | builder | `platform` | absent | `platform` | `platform` | denied | allowed | denied |
| Web/Mobile | Chat | authenticated | builder | `user_key` | absent | `platform` | `user_key` | denied | allowed | denied |
| Web/Mobile | Chat | authenticated | builder | `user_chatgpt` | absent | `chatgpt` | `user_chatgpt` | denied | allowed | denied |
| Web/Mobile | Chat | authenticated | builder | any | present | `platform` / `chatgpt` / `public` per funding source | varies | allowed | allowed | denied |
Notes:
- Workspace tools are structural and project-bound, not chosen via a separate execution target.
- Authenticated cloud chat may enter the same serial native loop with `web_research`, and with `community_tools` when a community lens is active.
- `runtimeRuns` persist active capability families and harness profile as runtime truth.
- Phase 2 runtime detail: the unified tool loop provisions a Daytona sandbox lazily when a workspace tool is actually called.
- Assistant response generation uses the Convex runtime endpoints (`/runtime/public_turn`, `/runtime/runtime_turn`).
- Community funnel action is a client projection from server-authored `entry_policy`; access remains server-authoritative.

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
   - free never receives `workspace_tools`
   - builder / architect receive `workspace_tools` only through project-bound runs
   - user-funded lanes do not imply workspace entitlement
   - idempotent run creation and replay behavior
