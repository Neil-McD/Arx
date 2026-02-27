# Canonical Harness Parity Matrix (V1)

Status: active (freeze)  
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`

## 1) Irreducible Harness Core

The canonical harness behavior is defined by four shared contracts:

1. Tool contract (`coding_harness_tools_v1`).
2. Approval contract (read auto-allow, write tools approval-gated).
3. Event lifecycle contract (`tool_call_requested` -> `tool_call_finished`).
4. Run lifecycle contract (`run_started` + terminal run event).

Everything else is adapter behavior.

## 2) Adapter Boundary (Only Legitimate Differences)

1. Local adapter:
   - executes tools in desktop workspace (`src-tauri`).
2. Daytona adapter:
   - executes tools in Daytona sandbox toolbox.
3. Runtime host:
   - local run host (`src-tauri`) vs cloud host (`runtime_turn`).

No other harness logic should diverge.

## 3) Golden Tool Parity (Coding Harness)

Canonical coding tool names:

1. `read`
2. `list_dir`
3. `glob`
4. `grep`
5. `sha256`
6. `write`
7. `edit`
8. `bash`
9. `update_plan`

Parity requirement:

1. Local harness must expose all canonical coding tools in agent lane.
2. Cloud Daytona lane must parse all canonical coding tools.
3. Cloud Daytona lane must auto-allow `update_plan` and persist plan updates as auditable run events.

## 4) Golden Approval Parity

Shared policy intent:

1. Read tools: auto-allow.
2. Write tools (`write`, `edit`, `bash`): explicit approval-gated.
3. Policy denials must be explicit and evented.
4. Cloud policy source of truth is `shared/contracts/coding_harness_tools_v1.json` (`approval_policy.cloud`).

Current cloud policy modes:

1. `agent-full`: write tools approved.
2. `agent`: write tools denied with approval-required code.
3. `read-only`: write tools denied with read-only code.

## 5) Golden Event Parity

Both paths must emit canonical tool lifecycle events:

1. `tool_call_requested`
2. `tool_call_approved` or `tool_call_denied`
3. `tool_call_started`
4. `tool_call_finished`

Run lifecycle parity:

1. Both emit `run_started`.
2. Both emit terminal `run_finished`.
3. Terminal payload uses canonical status semantics (`status='ok'|'error'|'cancelled'` + `reason?`).
4. Terminal event semantics must remain deterministic and auditable.

## 6) Drift Policy

Any harness change must update:

1. This matrix document.
2. `shared/contracts/coding_harness_tools_v1.json` if tool surface changes.
3. Contract guard script (`scripts/harness_parity_contract_check.sh`).

No silent divergence allowed between local and cloud harness behavior.
