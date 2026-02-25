# Canonical Cloud Run Contract V1

Status: active (contract freeze)  
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`  
Goal: one canonical cloud agentic harness shared by web + desktop, executed against Daytona.

## 1) Irreducible Components

1. Canonical run loop.
2. Canonical policy/approval gate.
3. Canonical event contract.
4. Canonical tool result normalization.
5. Canonical lane semantics across surfaces.

Everything else is adapter surface area.

## 2) First-Principles Rules

1. Do not duplicate harness logic across web and desktop.
2. Cloud agent turns are project-bound and sandbox-backed.
3. Tool calls are auditable lifecycle events, not implicit side effects.
4. Fallback lanes are explicit and observable, never silent.
5. Same request in web cloud and desktop cloud must produce the same run semantics.

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

Runtime endpoint: `supabase/functions/runtime_turn`

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

Current transitional Daytona-only observability events are allowed while migrating:

1. `daytona_probe_finished`
2. `daytona_lane_delegated`

## 6) Lane Semantics (Target)

1. `daytona`: canonical cloud agentic loop (tool-capable).
2. `public`: free non-tool lane.
3. `chatgpt_desktop`: desktop OpenAI authenticated lane (non-tool unless explicitly extended).
4. `platform_fallback`: explicit fallback lane only when contract says fallback is allowed.

## 7) Migration Sequence (from current state)

1. Freeze contract (this document + runtime metadata).
2. Replace Daytona probe/delegate behavior with full tool loop execution.
3. Route cloud-agent turns from both web and desktop to `requires_tools=true`.
4. Add parity tests (web cloud vs desktop cloud).
5. Remove silent fallback paths for cloud-agent turns.

## 8) Acceptance Criteria

1. Web cloud and desktop cloud show identical run lane + tool lifecycle behavior.
2. Cloud-agent turns on Daytona do not silently execute via platform fallback.
3. Every tool call has full request/approval/start/finish trace.
4. A failed run exposes deterministic code/message + lane context.

## 9) Explicit Non-Goals (V1)

1. No multi-project execution in a single thread.
2. No parallel tool calls in one run.
3. No desktop local harness behavior changes in this contract.

## 10) Tool Policy (Current)

Current canonical Daytona loop policy in this branch:

1. Auto-allowed read tools:
   - `read`
   - `list_dir`
   - `glob`
   - `grep`
   - `sha256`
2. Approval-gated write tools:
   - `write`
   - `edit`
   - `bash`
3. Approval mode behavior:
   - `approval_mode=agent-full` => write tools are allowed and evented as approved
   - `approval_mode=agent` (default) => write tools are denied with `tool_approval_required`
   - `approval_mode=read-only` => write tools are denied with `tool_denied_read_only_mode`
4. Explicitly denied:
   - `update_plan`
