# Bounded Workspace Loop (v2)

Status: protected coding-harness proposal; not current product-surface truth
Scope: OODA-based coding/runtime harness on top of protected workspace substrate

This document does not define or restore a standalone Workspace product. The
member personal agent, community-owned agent, and official MCP use the
canonical five-tool Polynet contract in
`canonical-platform-operation-contract-v1.md`.

## 1. First Principles

A useful workspace loop only needs to do six things:

1. observe the current thread, project, community, and prior run state
2. orient on the current bottleneck
3. decide the cheapest sufficient next action
4. execute one action
5. observe the result
6. either answer, continue, escalate, or stop with a blocker

This is an OODA loop:

- `observe`
- `orient`
- `decide`
- `act`

The loop exists to create autonomy.
The bounds exist to prevent doom loops, runaway cost, and fake progress.

## 2. Loop Shape

The loop should be:

- server-owned
- serial
- one tool call at a time
- bounded by budgets and progress rules, not tiny hard iteration caps
- recorded in `runtimeRuns` / `runtimeRunEvents`

The loop should not be:

- browser-owned
- hidden behind UI optimism
- recursive
- dependent on perpetual sandbox state
- forced into workspace compute when cheaper classes can unblock the task

## 3. Routing Levels

The router should choose the cheapest sufficient level first.

Current active level:

1. `workspace_minimal`
   - `list_dir`
   - `read`

Future layers can be added later, but they are not active until they are wired end to end and verified.

## 4. OODA Turn Model

Each turn should follow this cycle:

1. `observe`
   - thread history
   - project binding
   - community lens
   - relevant prior tool results
   - active run state

2. `orient`
   - identify the current bottleneck
   - identify the cheapest level that can relieve it
   - identify whether the task can already be answered honestly

3. `decide`
   - return final answer
   - or request one tool call
   - or stop with explicit blocker

4. `act`
   - execute tool
   - persist `tool_call_started`
   - persist `tool_call_finished`

5. `re-observe`
   - incorporate result into the next iteration

## 5. Initial Tool Set

Start with the smallest real set:

- `list_dir`
- `read`

Deferred until justified:

- `glob`
- `grep`
- `sha256`
- `write`
- `edit`
- `bash`
- `process`
- `apps`
- `browser`
- `MCP`

Rule:

If a tool is not wired end to end, it does not exist.

## 6. Initial Budgets

The product core should be semi-autonomous, not tiny-loop constrained.

Initial lane budgets:

- `chat`: `0`
- `workspace`: `30`

These are product budgets, not model beliefs. They should be explicit and match the live runtime.

## 7. Hard Guards

Do not rely only on raw iteration caps.

The loop must stop or downgrade when any of these are true:

1. repeated identical tool call with materially identical arguments
2. same tool fails twice without new information
3. total failure budget exceeded
4. no meaningful progress is being made
5. time budget exceeded
6. token budget exceeded
7. malformed tool call cannot be repaired safely

## 8. Progress Rules

After each tool result, the model should implicitly or explicitly establish:

1. what new information was learned
2. whether the bottleneck changed
3. whether the next action stays in the same level or escalates
4. whether the task can now be answered honestly

This is the main anti-doom-loop mechanism.

The loop should not continue just because budget remains.

## 9. Runtime Event Contract

At minimum, emit:

- `run_started`
- `turn_started`
- `tool_call_started`
- `tool_call_finished`
- `assistant_message_persisted`
- `run_finished`
- `run_failed`

Optional later:

- `tool_policy_resolved`
- `progress_stalled`

The work log should be human-readable.
Do not dump raw event noise into the UI.

## 10. Relationship To workspace runtime

The loop should live in the runtime, not inside the workspace runtime.

Blaxel’s role is:

- host project-bound execution
- expose filesystem and shell substrate
- provide temporary compute

Blaxel is not the loop owner.
Workspace tools call into Blaxel only when the model calls a workspace-scoped
tool and Polynet policy authorizes execution.

## 11. Relationship To Codex

The Codex reference suggests the right kernel shape:

- persistent `thread`
- bounded `turn`
- structured `events`
- structured `items`
- resume over time

Polynet should copy that shape, not the entire Codex product/runtime.

## 12. Product Rule

The loop exists to provide semi-autonomy and leverage.
It must not turn Polynet into a fake coding platform.

The workspace remains:

- project-bound
- community-aware
- tool-capable
- explicitly observable

That is the contract.
