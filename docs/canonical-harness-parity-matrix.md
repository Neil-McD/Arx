# Canonical Harness Parity Matrix (V1)

Status: active  
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`

## 1) Irreducible Core

Canonical harness parity is now defined by two authoritative runtime surfaces:

1. Desktop local runtime (`src-tauri` harness).
2. Cloud runtime (`/runtime/runtime_turn` in `convex/http.ts`).

For cloud behavior, the executable source of truth is runtime code, not a separate policy document.

## 2) Tool Surface

Shared tool subset (desktop + cloud):

1. `read`
2. `list_dir`
3. `glob`
4. `grep`
5. `sha256`
6. `write`
7. `edit`
8. `bash`

Desktop-only for now:

1. `update_plan`

Cloud policy:

1. `update_plan` is denied in cloud Daytona runtime.

## 3) Approval Policy (Cloud)

Authoritative implementation:

1. `convex/http.ts` (`resolveDaytonaToolPolicy`).

Current cloud policy posture:

1. Single deterministic mode: write tools are auto-approved by cloud policy.
2. Explicit cloud denials remain for contract-excluded tools (`update_plan`).

## 4) Event Parity

Tool lifecycle events required on cloud tool runs:

1. `tool_call_requested`
2. `tool_call_approved` or `tool_call_denied`
3. `tool_call_started`
4. `tool_call_finished`

Run lifecycle events:

1. `run_started`
2. terminal `run_finished`

## 5) Drift Policy

Any harness behavior change must update:

1. `convex/http.ts` runtime behavior.
2. This matrix doc.
3. Runtime guard coverage (`scripts/runtime_turn_contract_guard.sh`, `scripts/reliability_turn_path_smoke_check.sh`).

No silent divergence between docs and runtime behavior.
