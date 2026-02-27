# Convex Gate Matrix v1 (Contract-First)

Status: draft  
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`  
Purpose: define one canonical authorization/routing contract before migrating data/runtime from Supabase to Convex.

## 1) Irreducible Inputs

Every gate decision must derive from these inputs only:

1. Surface: `web | desktop | mobile`
2. Execution mode: `cloud | local`
3. Auth state: `anonymous | authenticated`
4. Account tier: `free | builder | architect`
5. Community role: `none | member | mod | admin | owner`
6. Model class: `free_model | paid_model`
7. Turn class: `chat_only | requires_tools`
8. Context scope: `global | community | project`

## 2) Irreducible Outputs

1. Allow/deny model selection
2. Allow/deny send turn
3. Lane routing (`public`, `platform`, `chatgpt_desktop`, `daytona_cloud`, `local_runtime`)
4. Allow/deny feature action
5. Allow/deny tab visibility and tab actions
6. Required UX CTA (`sign_in`, `upgrade`, `join`, `request_access`, `checkout`, `none`)

## 3) Core Invariants

1. Backend is authoritative for all gates. UI is advisory.
2. Free users never get Daytona cloud tool execution.
3. Community access is role+entitlement based, never inferred from UI state.
4. One cloud thread belongs to exactly one cloud project.
5. Every denied action returns a stable machine error code and one UX CTA.
6. Desktop ChatGPT auth does not imply Daytona entitlement.
7. Canonical paid tiers are `builder` and `architect` on PolyNet.
8. Legacy `pro` must be normalized to `architect` at read/write boundaries during migration.

## 4) Tier Matrix (Global Platform)

| Capability | Anonymous | Auth Free | Builder | Architect |
|---|---|---|---|---|
| Sign in | required | yes | yes | yes |
| Free models | yes | yes | yes | yes |
| Paid models (platform key lane) | no | no | yes | yes |
| Desktop ChatGPT lane | no | yes (desktop only) | yes (desktop only) | yes (desktop only) |
| Cloud tools (Daytona) | no | no | yes | yes |
| Local tools (desktop local mode) | yes (desktop only) | yes (desktop only) | yes (desktop only) | yes (desktop only) |
| Create community | no | no | yes | yes |
| Max owned communities | 0 | 0 | policy limit | policy limit |
| Create cloud project | no | no | yes | yes |
| Max cloud projects | 0 | 0 | 5 (v1) | 5 (v1, raise later) |

## 5) Model Gating Matrix

| Auth | Tier | Model class | Desktop ChatGPT auth | Allowed | Preferred lane | Fallback lane |
|---|---|---|---|---|---|---|
| anonymous | n/a | free_model | n/a | yes | `public` | none |
| anonymous | n/a | paid_model | n/a | no | none | none |
| authenticated | free | free_model | no | yes | `public` | none |
| authenticated | free | paid_model | no | no | none | none |
| authenticated | free | paid_model | yes | yes (desktop only) | `chatgpt_desktop` | `public` free model only |
| authenticated | builder/architect | free_model | optional | yes | `public` or `platform` | none |
| authenticated | builder/architect | paid_model | optional | yes | `platform` | free model fallback |

## 6) Runtime Routing Matrix

| Mode | Turn class | Tier | Route |
|---|---|---|---|
| cloud | `chat_only` | free | `public` |
| cloud | `chat_only` | builder/architect | `platform` |
| cloud | `requires_tools` | free | deny (`platform_inference_not_allowed`) |
| cloud | `requires_tools` | builder/architect | `daytona_cloud` |
| local (desktop) | `chat_only` | any | existing local chat/local runtime policy |
| local (desktop) | `requires_tools` | any | existing local coding harness |

## 7) Community Gating Matrix

| Community visibility | User state | Action | Result CTA |
|---|---|---|---|
| published | anonymous | open landing | allow |
| published | anonymous | join | `sign_in` |
| published + free join | authenticated | join | allow |
| published + paid join | authenticated free | join | `checkout` |
| published + paid join | authenticated paid | join | allow if purchase/entitlement valid |
| unlisted/private | non-member | open landing | allow (limited metadata) |
| unlisted/private | non-member | open gated tabs/actions | deny + `request_access` or `join` |

## 8) Community Tabs Matrix

Tabs: `Chat`, `Library`, `Resources`, `Members`, `Settings`, `AI Agent`, `Analytics`

| Tab | Role none | member | mod | admin | owner |
|---|---|---|---|---|---|
| Chat | read landing only | read/write | mod tools | mod tools | mod tools |
| Library | read landing only | read | manage where allowed | manage | manage |
| Resources | read landing only | read | manage | manage | manage |
| Members | hidden or limited | limited list | moderation | full | full |
| Settings | hidden | hidden | partial | full | full |
| AI Agent | hidden or upsell | use policy | moderate policy | configure | configure |
| Analytics | hidden or teaser | read policy | read policy | full | full |

## 9) Canonical Gate Functions (to implement once, reused everywhere)

1. `resolveAuthState(session): AuthState`
2. `resolveTier(userId): TierState`
3. `resolveCommunityRole(userId, communityId): CommunityRoleState`
4. `canUseModel(input): GateDecision`
5. `canRunTools(input): GateDecision`
6. `canAccessFeature(input): GateDecision`
7. `canAccessCommunityTab(input): GateDecision`
8. `resolveRuntimeLane(input): LaneDecision`

Return shape (stable):

```ts
type GateDecision = {
  allowed: boolean;
  code:
    | "ok"
    | "auth_required"
    | "tier_required"
    | "plan_required"
    | "community_entitlement_required"
    | "community_role_required"
    | "project_required"
    | "runner_unavailable";
  cta: "none" | "sign_in" | "upgrade" | "join" | "request_access" | "checkout";
  lane?: "public" | "platform" | "chatgpt_desktop" | "daytona_cloud" | "local_runtime";
};
```

## 10) Cutover Rules (Supabase -> Convex)

1. Keep matrix behavior identical during migration.
2. Build Convex gate functions first, then route reads/writes to Convex.
3. Run parity checks for gate outputs on sampled requests before full cutover.
4. Do not change UX copy and CTA mapping until parity is green.

## 11) What Is Explicitly Deferred

1. Project snapshots/version restore UX.
2. Advanced multi-project context in a single tool run.
3. Fine-grained per-model cost governance UI.
4. Convex-first billing rewrite (billing projection can remain adapter-based during phase 1).

## 12) Tier Canonicalization Rule

1. Canonical enum in product and backend contracts: `free | builder | architect`.
2. Temporary compatibility mapping allowed only in adapters:
   - `pro -> architect`
3. No new code should persist `pro` after this point.
