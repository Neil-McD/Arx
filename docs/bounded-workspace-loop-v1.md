# Bounded Workspace Loop (v1)

Status: proposed  
Scope: first honest workspace harness on top of the reduced workspace contract

## 1. First Principles

A workspace loop only needs to do five things:

1. receive a user goal
2. decide whether to answer or use one tool
3. execute that tool
4. observe the result
5. either stop or continue

The loop exists to create autonomy.
The loop must remain bounded so it does not create chaos.

## 2. Loop Shape

The loop should be:

- server-owned
- serial
- one tool call at a time
- bounded by iteration, time, and failure limits
- recorded in `runtimeRuns` / `runtimeRunEvents`

The loop should not be:

- browser-owned
- hidden behind UI optimism
- unbounded
- recursive
- dependent on perpetual sandbox state

## 3. Turn Model

Each workspace turn is bounded.

The runtime should:

1. create or resume a `runtimeRun`
2. assemble model context from:
   - thread history
   - project context
   - community lens
   - relevant prior run/tool results
3. ask the model for one of:
   - final assistant response
   - single tool call
4. if tool call:
   - run tool
   - persist `tool_call_started`
   - persist `tool_call_finished`
   - feed result back into the next iteration
5. stop on answer or loop boundary

## 4. Active Initial Tool Set

Start with the smallest real set:

- `read`
- `list_dir`

Deferred until justified:

- `glob`
- `grep`
- `sha256`
- `write`
- `edit`
- `bash`
- `glob`
- `process`
- `apps`
- `browser`
- `MCP`

Rule:

If a tool is not wired end to end, it does not exist.

## 5. Stop Conditions

The loop must stop when any of these are true:

1. the model returns a final assistant response
2. max iterations reached
3. tool fails twice without progress
4. time budget reached
5. token budget reached
6. no meaningful progress is being made

## 6. Suggested Initial Bounds

For v1:

- max iterations: `3-5`
- one tool call per iteration
- serial execution only
- fail closed on malformed tool calls

These numbers are product controls, not model beliefs.

## 7. Runtime Event Contract

At minimum, the loop should emit:

- `run_started`
- `tool_call_started`
- `tool_call_finished`
- `assistant_message_persisted`
- `run_finished`
- `run_failed`

Optional later:

- `model_output_invalid_json`

The work log should be human-readable.
Do not dump raw event noise into the UI.

## 8. Relationship To Daytona

The loop should live in the runtime, not inside Daytona.

Daytona’s role is:

- host project-bound execution
- expose filesystem/shell substrate
- provide temporary compute

Daytona is not the loop owner.
The loop calls Daytona-backed tools when needed.

## 9. Relationship To Thread Continuity

Continuity should come from:

- thread history
- project state
- runtime run truth
- community lens

Not from requiring a perpetual sandbox session.

This follows the same general direction as Codex:

- persistent thread identity
- bounded turns
- structured events
- resume over time

without copying the entire Codex product/runtime model.

## 10. Implementation Order

The correct order is:

1. prove one real tool call end to end
2. prove one real assistant response end to end
3. add bounded loop
4. add more tools only when justified

Do not introduce a rich loop on top of dishonest primitives.

## 11. Product Rule

The loop exists to increase autonomy and leverage.
It must not turn the workspace into a fake coding platform.

The workspace remains:

- project-bound
- community-aware
- tool-capable
- explicitly observable

That is the contract.
