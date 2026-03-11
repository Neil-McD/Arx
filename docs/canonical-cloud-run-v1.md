# Canonical Cloud Run Contract V1

Status: active (contract freeze)  
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`  
Goal: one canonical cloud agentic harness for the Polynet web surface, executed against Daytona.

## 1) Irreducible Components

1. Canonical run loop.
2. Canonical policy/approval gate.
3. Canonical event contract.
4. Canonical tool result normalization.
5. Canonical lane semantics across surfaces.

Everything else is adapter surface area.

## 2) First-Principles Rules

1. Do not duplicate harness logic across web controllers and runtime routes.
2. Cloud agent turns are project-bound and sandbox-backed.
3. Tool calls are auditable lifecycle events, not implicit side effects.
4. Fallback lanes are explicit and observable, never silent.
5. The same request must produce the same run semantics across every web entrypoint.

## 3) Canonical Loop (Cloud)

For cloud-agent turns:

1. Resolve thread + project ownership.
2. Resolve or create Daytona sandbox for `(user_id, project_id)`.
3. Start run (`run_started` with contract metadata).
4. Execute agent loop:
   - infer step
   - tool call request/approval/start/finish events
   - feed tool outputs back into inference
   - iterate until final assistant response
5. Complete with `run_completed` or `run_failed`.

## 4) Runtime Contract Surface

Runtime endpoint: `/runtime/runtime_turn` (implemented in `convex/http.ts`)

Contract metadata included on run events:

1. `contract_name = "canonical_cloud_run_v1"`
2. `contract_version = "v1"`
3. `execution_mode = "agentic"` for tool-enabled cloud turns, else `"chat"`

## 5) Non-Negotiable Event Semantics

Minimum events for cloud-agent turns:

1. `run_started`
2. `tool_call_requested`
3. `tool_call_approved` or `tool_call_denied`
4. `tool_call_started`
5. `tool_call_finished`
6. `run_completed` or `run_failed`

## 6) Lane Semantics (Target)

1. `daytona`: canonical cloud agentic loop (tool-capable).
2. `public`: free non-tool lane.
3. `chatgpt`: user-funded OpenAI authenticated lane (non-tool unless explicitly extended).
4. `platform_fallback`: explicit fallback lane only when contract says fallback is allowed.

## 7) Migration Sequence (from current state)

1. Freeze contract (this document + runtime metadata).
2. Replace Daytona probe/delegate behavior with full tool loop execution.
3. Route Daytona workspace turns from the web surface to `requested_execution_target=daytona_workspace`.
4. Add parity tests across web entrypoints and gate contracts.
5. Remove silent fallback paths for cloud-agent turns.

## 8) Acceptance Criteria

1. Web cloud entrypoints show identical run lane + tool lifecycle behavior.
2. Cloud-agent turns on Daytona do not silently execute via platform fallback.
3. Every tool call has full request/approval/start/finish trace.
4. A failed run exposes deterministic code/message + lane context.

## 9) Explicit Non-Goals (V1)

1. No multi-project execution in a single thread.
2. No parallel tool calls in one run.
3. No local runtime behavior is in scope for this contract.

## 10) Tool Policy (Current vs Target)

Current implemented scope in `convex/http.ts`:

1. For `requested_execution_target=daytona_workspace`, runtime executes a real Daytona-backed probe tool call (`bash pwd` in `workspace`) and persists full lifecycle evidence.
2. Runner failures are fail-closed (no silent fallback when Daytona execution fails).
3. Probe output is injected into the iterative inference loop as explicit tool-result context.
4. Model-directed tool loop is active for cloud tool turns, with policy-evented `tool_call_requested` / `tool_call_approved|denied` / `tool_call_started` / `tool_call_finished`.
5. Cloud tool turns use a single deterministic policy posture over the active cloud tool subset.
6. Web clients send the same minimal runtime turn payload shape (no approval-mode branch state).

Target scope (next slice, not complete yet):

1. Final tool policy parity and contract freeze for all allowed cloud tools.
2. Additional cloud guard coverage for deterministic lane + lifecycle behavior.
