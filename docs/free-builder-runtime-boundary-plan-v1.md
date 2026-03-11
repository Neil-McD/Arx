# Free vs Builder Runtime Boundary Plan v1

Status: draft  
Scope: workspace runtime only  
Non-goal: visual redesign

## 1) Irreducible Goal

The workspace product should reduce to one clear rule:

- `anonymous free`: try the platform
- `free`: use chat in the cloud with the community harness
- `builder`: use chat with the community harness plus Daytona tools

That means the runtime must preserve a hard boundary between:

1. `chat` turns
2. `daytona_workspace` turns

If that boundary is blurry, the product drifts in all downstream surfaces:

- upgrade prompts become misleading
- free users are pushed into paid runtime paths
- error handling feels random
- community and workspace access logic become harder to reason about

## 2) Canonical Contract

### Account tiers

- `anonymous free`
- `free`
- `builder`

### Funding lanes

- `demo_public`
- `user_key`
- `user_chatgpt`
- `platform`

### Requested execution targets

- `chat`
- `daytona_workspace`

### Canonical runtime rule

1. Free and anonymous users may only run `chat` turns.
2. Builder users may run both `chat` and `daytona_workspace` turns.
3. `requested_execution_target=daytona_workspace` is the only way to enter the Daytona lane.
4. `user_chatgpt` and `user_key` are funding lanes, not entitlements to the coding harness.
5. The client may request an execution target; the server is the source of truth for gating.

## 3) Current Drift

### Drift A: authenticated cloud turns are defaulting to tool turns

The main workspace send path previously routed all non-public turns through `runAgentTurn(... requestedExecutionTarget: "daytona_workspace")`:

- [`shared/useWebSendFlowController.ts:261`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebSendFlowController.ts#L261)
- [`shared/useWebSendFlowController.ts:360`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebSendFlowController.ts#L360)
- [`shared/useWebSendFlowController.ts:463`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebSendFlowController.ts#L463)

This collapses:

- `free authenticated cloud chat`
- `builder Daytona workspace turns`

into one runtime request shape.

### Drift B: the gate engine is correct, but the UI path is not

The canonical gate engine still distinguishes `chat` from `daytona_workspace` correctly:

- [`shared/canonicalGateEngine.mjs:95`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/canonicalGateEngine.mjs#L95)
- [`convex/gates.ts:103`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/gates.ts#L103)

But the send controller is effectively bypassing that product distinction by always asking for tools on the authenticated path.

### Drift C: pricing and UI semantics were ahead of runtime semantics

The plan UI now correctly says:

- Free gets chat and provider connections
- Builder gets platform-funded premium models and Daytona tools

See [`shared/BuilderUpgradeModal.tsx:66`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/BuilderUpgradeModal.tsx#L66)

But runtime behavior still partially behaves like:

- authenticated cloud turn = Daytona workspace turn

That makes the UI more honest than the runtime.

## 4) Desired End State

### Anonymous free

- public demo chat only
- no authenticated cloud turns
- no user provider connections
- no Daytona

### Free

- authenticated cloud chat
- may use `user_chatgpt` or `user_key` for `chat` turns
- community harness and community tools when a community lens is active
- no Daytona
- no coding tools

### Builder

- authenticated cloud chat
- platform-funded premium chat
- community harness and community tools
- Daytona workspace turns
- project-bound coding runtime

## 5) Design Principles

1. Do not redesign the workspace UI.
2. Do not add chat/code mode toggles.
3. Do not make the UI guess entitlement from copy alone.
4. Keep the runtime contract explicit and server-authored.
5. Prefer deletion over additional branching.

## 6) What To Delete

These are the main deletions needed to restore coherence:

1. Delete the assumption that non-public cloud turns always require tools.
2. Delete any UI logic that treats authenticated cloud usage as implicitly Builder-grade.
3. Delete upgrade/error copy that is triggered by a tool-denial path for what should have been a free chat-only turn.

## 7) Execution Plan

### Phase 1: Restore a truthful send contract

Goal: free authenticated usage must send `chat` turns by default.

Changes:

1. In [`shared/useWebSendFlowController.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebSendFlowController.ts), stop hardcoding Daytona workspace escalation for all non-public turns.
2. Introduce a single local decision point for execution target:
   - default to `chat`
   - only request `daytona_workspace` when the action explicitly needs Builder-only tools
3. Use the same decision path for:
   - send
   - retry
   - regenerate

Acceptance:

1. Free authenticated turns no longer hit Daytona-only gating by default.
2. Builder-only tool gating still works.
3. Public model turns are unchanged.

### Phase 2: Make the UI controller consume the canonical gate cleanly

Goal: keep the send controller aligned with the canonical gate engine.

Changes:

1. Route the chosen `requestedExecutionTarget` through the same gate semantics already defined in:
   - [`shared/canonicalGateEngine.mjs`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/canonicalGateEngine.mjs)
   - [`convex/gates.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/gates.ts)
2. Ensure a free authenticated user on:
   - `user_chatgpt`
   - `user_key`
   gets `chat`, not a paid tool denial
3. Ensure Builder retains tool-capable execution without adding a mode toggle

Acceptance:

1. Gate parity stays green.
2. Free users with provider connections can chat without seeing Builder-only errors.
3. Builder users still get Daytona for real tool turns.

### Phase 3: Harden runtime truth and errors

Goal: runtime errors should reflect the real requested action.

Changes:

1. Confirm `/runtime/runtime_turn` uses `requested_execution_target` as the canonical runtime control:
   - [`convex/httpRuntimeRoutes.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpRuntimeRoutes.ts)
2. Audit error handling so:
   - `tier_required` only appears for real tool-capable requests
   - free chat-only requests do not surface Builder upgrade CTAs unless they actually requested a Builder-only path
3. Keep `project_required` scoped to tool turns only

Acceptance:

1. Error copy becomes legible.
2. Upgrade prompts only appear on real Builder boundaries.
3. Chat-only runtime stays project-optional.

### Phase 4: Add focused contract coverage

Goal: prevent this drift from reappearing.

Changes:

1. Extend gate/runtime parity coverage for:
   - authenticated free + `user_chatgpt` + `chat`
   - authenticated free + `user_key` + `chat`
   - authenticated free + `platform` + `chat` denied
   - authenticated free + any funding + `daytona_workspace` denied
   - Builder + `daytona_workspace` allowed
2. Add a UI/controller-level check if one is missing around send-path execution target selection

Acceptance:

1. The send path cannot silently re-collapse chat and tools.
2. Contract checks catch regressions before runtime drift ships.

## 8) Implementation Order

1. `shared/useWebSendFlowController.ts`
2. related send-path helpers if needed
3. tests / contract fixtures
4. only then broader workspace copy cleanup

## 9) First Slice

The first slice should be intentionally small:

1. add one helper in the send controller that resolves `requestedExecutionTarget`
2. make it return `false` for the normal authenticated chat path
3. thread that through send, retry, and regenerate
4. run:
   - `npm run convex:codegen`
   - `npm run check:gate-parity`
   - `npm run check:runtime-turn-contract-guard`
   - `npm run build` in `apps/web`

## 10) Blind Spots

1. If there is any hidden UI affordance that already assumes Builder means "workspace mode", removing implicit default escalation may expose dead copy or dormant buttons.
2. Builder users may currently be relying on the accidental default-to-tools behavior. That is product drift, but changing it may alter perceived behavior unless tool entry remains obvious somewhere else.
3. Funding-lane preference is still a separate drift bucket. Even after this fix, Builder users with ChatGPT connected may still prefer `user_chatgpt` for chat-only GPT-family turns unless lane selection is later revisited.

## 11) Outcome

After this plan, the runtime contract should become truthful again:

- Free means cloud chat, not accidental tool-denial
- Builder means tools when tools are actually requested
- Daytona remains paid-only without contaminating the default authenticated chat path
