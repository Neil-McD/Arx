# Codex Blaxel Bridge POC

Status: Slice 1 implementation contract for `codex/blaxel-codex-bridge-poc`

## Goal

Prove the most direct path to a Codex-owned execution harness inside Blaxel while Polynet stays the memory, context, permission, and audit ledger.

Target shape:

```text
Polynet turn
  -> scoped context packet and run token
  -> Blaxel workspace computer
  -> codex exec --json
  -> Polynet context/MCP tools
  -> streamed events, final answer, artifacts, audit ledger
```

This is not a rewrite of Polynet's product harness. It is a bridge proof that decides whether Codex can own the agent execution loop while Polynet owns product context and memory.

## Non-Goals

- Do not port Codex internals into Convex.
- Do not build another deterministic router.
- Do not add a Fly worker unless Blaxel cannot supervise the Codex process reliably.
- Do not pass raw user browser sessions or long-lived ChatGPT tokens into Blaxel.
- Do not touch production deploy paths during the POC.

## First Principles

The irreducible parts are:

1. A remote process that can run Codex headlessly.
2. A scoped Polynet run identity that lets the process ask for context and append events.
3. A context packet that gives Codex enough orientation without forcing deterministic decisions.
4. A tool surface that lets Codex dynamically fetch community, memory, MCP, and workspace context.
5. A durable ledger of what context and tools were used.

Everything else is optional until one of those five cannot work.

## Evidence Map

### Current Blaxel Runtime Surface

- `convex/blaxelWorkspaceClient.ts`: Blaxel SDK adapter, sandbox/volume lifecycle, command/process/file/preview operations.
- `convex/workspaceRuntimeSession.ts`: creates billable Blaxel runtime sessions for project-bound agent work.
- `convex/workspaceRuntimeTools.ts`: existing runtime tool executor for read/write/edit/bash/glob/grep-style workspace tools.
- `convex/workspaceTerminalProcessCore.ts`: long-running Blaxel process start/read/stop path. This is the closest existing primitive for `codex exec --json`.
- `scripts/run_blaxel_*`: existing staging probes and smoke tests.

### Current Context Coherence Surface

- `shared/runtimeTurnEnvelope.ts`: compact per-turn orientation envelope.
- `shared/runtimeTurnContextPacket.ts`: canonical prompt packet for active terminals, tool attempts, working state, and turn envelope.
- `convex/runtimeTurnContext.ts`: loader that builds the runtime packet from stored thread/run/project evidence.
- `convex/runtimeTurnPersistence.ts`, `convex/runtimeTurnHandlers.ts`: run event persistence and failure context reload paths.

### Current Harness Surface

- `convex/runtimeAgentLoop.ts`: current Polynet native tool loop and provider calls.
- `shared/runtimeKernel.ts`: generic model-tool loop kernel.
- `convex/runtimeHarnessComposition.ts`: mounted tools, community skills, personal skills, and prompt suffix composition.
- `convex/runtimeMcpManager.ts`, `convex/runtimeMountedToolExposure.ts`: MCP runtime execution and search-to-expose flow.
- `docs/mcp-app-architecture-contract.md`: user app state is runtime authority; community lens adds context, not a second MCP runtime.

### Existing Auth and Token Bridge Surface

- `convex/providerConnections.ts`: encrypted ChatGPT/OpenAI provider connection storage and connect/disconnect flows.
- `convex/chatgptAuth.ts`: ChatGPT OAuth PKCE, token refresh, encrypted persistence, fresh-token lookup.
- `convex/chatgptResponsesTransport.ts`: server-side call to `https://chatgpt.com/backend-api/codex/responses`.
- `convex/httpAuthBridge.ts`: same-origin runtime auth bridge with bridge secret, bearer identity validation, session create/bootstrap/refresh/logout.
- Historical desktop reference: `/Users/neilmcdevitt/code/arx/.worktrees/daytona-desktop-preserved/src-tauri/src/commands/auth_invite.rs` used Codex's ChatGPT OAuth shape, localhost callback, stored tokens, refresh, and Codex Responses headers.

The reusable idea is not raw token forwarding. The reusable idea is scoped, server-owned session exchange and refresh.

### Codex Reference Shape

Reference clone:

- `/Users/neilmcdevitt/code/arx/references/repos/codex`
- `main` at `2d5c264eb`

Practical entrypoint:

- `codex exec --json`: headless run with JSONL event stream.
- `--dangerously-bypass-approvals-and-sandbox`: explicit full-access mode.
- `codex-rs/exec-server`: process/filesystem RPC server, useful later if direct `codex exec` is not enough.

Harness model:

- `codex-rs/core/src/session/turn.rs` and `session/mod.rs`: session/turn loop owns context and tool results over time.
- `codex-rs/core/src/tools/spec_plan.rs`: builds model-visible tools plus registry; router dispatches model-chosen tools.
- `codex-rs/core/src/mcp_tool_exposure.rs`: direct vs deferred MCP exposure; `tool_search` exists to avoid stuffing all tools into the prompt.

The important lesson: Codex does not deterministically route intent. It gives the model a compact orientation, a discoverable tool system, and an execution harness.

### Staging Surface

- `.env.staging.local.example`: Convex staging is `dev:quick-porcupine-949`, Vercel staging is `polynet-staging`.
- `.env.blaxel.local.example`: local/staging Blaxel credentials and lifecycle knobs.
- `scripts/blaxel_staging_readiness_guard.sh`: refuses production Vercel/Convex and validates staging linkage.

The bridge POC branch is named with the staging-safe `codex/blaxel-` prefix, so the existing readiness guard remains unchanged.

## Elon Algo

### Delete or Avoid

- Reimplementing the Codex tool/session loop in Convex.
- Adding deterministic routing rules for "which context to use".
- Adding a general-purpose Fly worker before proving Blaxel cannot own process supervision.
- Adding a second MCP ownership path for communities.
- Passing durable user secrets into a sandbox.
- Building UI before the Blaxel/Codex process and scoped token bridge work.

### Keep

- Convex as canonical authority for users, communities, entitlements, threads, messages, memory, and run audit.
- Blaxel as the remote workspace computer.
- Runtime turn context packet as the compact orientation layer.
- User-owned MCP state as runtime tool authority.
- Community lens as prompt/context/skill/resource authority.
- Staging-only proof path before any production release.

### Change

- Treat the Polynet harness as a context and memory layer for Codex, not as the primary execution loop for Codex-backed runs.
- Use Codex JSONL events as the first bridge event stream instead of inventing a new event protocol.
- Use Blaxel long-running process primitives for `codex exec --json` before adding new service infrastructure.
- Adjust staging guard to allow the bridge branch prefix.

### Add

- A small bridge contract: run request, scoped token, event, result.
- A dev-only Convex action/mutation path to create bridge runs and append events.
- A Blaxel command/process starter for `codex exec --json`.
- A Polynet context tool endpoint usable by the Codex process with a scoped run token.
- A kill switch/feature flag so no normal runtime turn silently flips to Codex.

## Bridge Contract

### Request

```ts
type CodexBridgeRunRequestV1 = {
  version: 1;
  runId: string;
  threadId: string;
  userId: string;
  communityId?: string | null;
  projectId: string;
  prompt: string;
  contextPacket: RuntimeTurnContextSnapshotV1;
  allowedToolNames: string[];
  scopedRunToken: string;
  polynetBaseUrl: string;
  callbackUrl?: string | null;
  budget: {
    maxSeconds: number;
    maxOutputBytes: number;
  };
};
```

### Event

```ts
type CodexBridgeRunEventV1 = {
  version: 1;
  runId: string;
  sequence: number;
  source: "codex_exec_jsonl" | "bridge_worker" | "polynet_tool";
  eventType: string;
  payload: unknown;
  createdAt: number;
};
```

### Result

```ts
type CodexBridgeRunResultV1 = {
  version: 1;
  runId: string;
  status: "succeeded" | "failed" | "cancelled" | "timed_out";
  finalText?: string | null;
  outputBytes: number;
  eventCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  finishedAt: number;
};
```

## Security Model

- The sandbox receives a short-lived run token, not a durable user token.
- The run token is bound to `runId`, `userId`, `threadId`, `projectId`, optional `communityId`, expiry, and allowed bridge operations.
- The first implementation uses `ARX_CODEX_BRIDGE_SIGNING_SECRET` in Convex to mint/verify HMAC bridge tokens.
- Public staging smoke actions require a short-lived operator token minted from `POLYNET_CODEX_BRIDGE_OPERATOR_SECRET`; the token is bound to action, `runId`, `projectId`, `threadId`, and explicit callback origin when one is provided. Staging-only is not authorization.
- Bridge run scope is resolved server-side from the thread. The smoke CLI `projectId` is a temporary expected value only; it must match `thread.projectId` and cannot independently select the workspace/context scope.
- Codex exec smoke requires `POLYNET_CODEX_BRIDGE_OPENAI_API_KEY`; there is no shared `OPENAI_API_KEY` fallback.
- Blaxel receives the token through `POLYNET_CODEX_BRIDGE_TOKEN` process env, not through the persisted command string.
- Codex auth uses a per-run temporary `CODEX_HOME`; the bridge removes it after the smoke command exits.
- Polynet validates every context/tool call server-side against membership, entitlement, thread lens, and tool authority.
- First POC tools are read-only context tools plus event append.
- Write tools and MCP mutation-shaped tools stay disabled until read-only bridge reliability is proven.
- Blaxel receives no production secrets during staging POC.

## Aggressive Implementation Plan

### Slice 1: Bridge Skeleton, No Real Codex

Must prove:

- Staging guard allows the bridge branch while still refusing production.
- Convex can create a dev-only bridge run with a scoped token.
- A Blaxel process can call back to Polynet with that token and append an event.
- The event is visible in the run ledger.

Implementation:

- Add `shared/codexBridgeContract.ts`.
- Add minimal Convex bridge actions/mutations, dev/staging gated.
- Add `/runtime/codex_bridge/event` and `/runtime/codex_bridge/finish`.
- Add a script or command path that starts a Blaxel process which echoes a JSONL event and calls the append endpoint.
- Run `npm run check:blaxel-staging-readiness` after fixing branch guard.
- Run `git diff --check`.

No UI. No Codex model call. No production.

Status: complete on Convex staging. Latest verified echo run:
`codex_bridge_echo_1780546614246_f1fd05cf`.

### Slice 2: Codex Exec Smoke

Must prove:

- Blaxel can run `codex exec --json --dangerously-bypass-approvals-and-sandbox`.
- The process emits parseable JSONL and forwards JSONL event metadata while the Codex child process is still running.
- Final text and errors can be converted into `CodexBridgeRunResultV1`.
- The run remains operator-only, staging-only, and `internal_hidden`.
- A bounded Polynet context callback is available to the process through the same scoped token.

Implementation:

- Use local `codex` in the sandbox when present; otherwise use `npx -y @openai/codex@0.137.0`.
- Start with a harmless prompt that must return exactly `BRIDGE_CODEX_OK`.
- Run Codex through a streaming child process and post bounded stdout JSONL event summaries through `/runtime/codex_bridge/event` as lines arrive.
- Persist JSONL event metadata, marker match, exit code, character counts, and elapsed time without raw stdout/stderr/error previews.
- Use `/runtime/codex_bridge/context` for a bounded context packet and append `codex_bridge_context_fetched`.
- Use `smoke:codex-bridge-codex-exec` as the explicit staging proof command.
- Do not hook this action into the normal web/runtime send path.

Status: complete on Convex staging. Latest verified Codex exec run:
`codex_bridge_codex_exec_1780546631416_872460e2`.

### Slice 3: Read-Only Polynet Context Tool

Must prove:

- Codex can discover or be told about one Polynet context fetch tool.
- The tool uses the scoped run token.
- Polynet returns bounded community/thread/context packet data.
- Context access fails closed when scope is invalid.

Implementation:

- Add one endpoint/action: `/runtime/codex_bridge/context`.
- Return only the current run's bounded runtime turn packet and prompt rendering through the explicit `{ ok, context }` HTTP envelope.
- Append audit events for context fetches.

Status: implemented as the first read-only context tool surface. Real Codex smoke is healthy; community resource-map expansion remains the next context slice.

### Slice 4: Staging UI Trigger

Must prove:

- An operator/dev can start a Codex-backed run from the staging web app.
- The existing thread/run UI can show progress and final result.
- Failure paths are obvious and recoverable.

Implementation:

- Feature flag only.
- One authenticated operator action and compact operator-panel trigger, not a user-facing default.
- Use Vercel `polynet-staging` plus Convex `dev:quick-porcupine-949`.

Status: first staging operator trigger implemented locally. The browser calls an authenticated Convex action, Convex verifies operator write access, starts a hidden Codex exec run in Blaxel asynchronously, and polls the hidden bridge run ledger while Codex is still running. True live progress in the normal thread UI remains a later UI slice; the operator panel is the current staging control surface.

Async liveness contract:

- The async launcher records a `codex_exec_process_started` event with the Blaxel process handle for the run.
- A staging-only operator reconciliation action can read the Blaxel process, append a bounded `codex_exec_process_observed` event, and close a terminal or stale missed-callback run through the existing bridge finalizer.
- Blaxel `standby` sandboxes are treated as not-ready for command execution; the bridge must not launch Codex into a sleeping/redeploying sandbox.
- This is lifecycle supervision only; it does not route context, select tools, or constrain Codex behavior.

### Slice 5: Replace One Narrow Runtime Path

Must prove:

- One real project-bound workspace turn can run through Codex in Blaxel.
- Polynet records context, tool usage, final answer, and artifacts.
- Cost and latency are acceptable.

Implementation:

- Feature flag per user or operator.
- Start with an operator-only staged thread turn, then an explicit staging-only `/runtime/turn` opt-in via `requested_harness: "codex_bridge"` guarded by `POLYNET_ENABLE_CODEX_BRIDGE_RUNTIME_TURNS`; both persist the user prompt, stream JSONL evidence, and persist the final Codex assistant text through the existing idempotent bridge finalizer.
- Enable write/bash only after audit and cancellation are reliable.

## Kill Criteria

Stop and reassess if any of these happen:

- Codex cannot run headlessly in Blaxel without manual auth hacks.
- JSONL event capture is unreliable.
- Blaxel cannot keep the process alive or expose enough logs for supervision.
- Scoped token validation becomes complex enough to leak authority.
- Staging cost per simple run is materially higher than expected.
- We need to duplicate large parts of Codex internals to make it work.

## Current Verification

Completed in this worktree against Convex staging `dev:quick-porcupine-949`:

1. `npm run check:codex-bridge-contract-proof`
2. `npx tsc --noEmit --pretty false`
3. `git diff --check`
4. `CONVEX_DEPLOYMENT=dev:quick-porcupine-949 npx convex codegen`
5. `CONVEX_DEPLOYMENT=dev:quick-porcupine-949 npm run check:blaxel-staging-readiness`
6. Operator-token-gated echo smoke: `codex_bridge_echo_1780546614246_f1fd05cf`
7. Operator-token-gated Codex exec smoke: `codex_bridge_codex_exec_1780546631416_872460e2`
8. Direct sandbox cleanup check found no leftover per-run `CODEX_HOME` directory for `codex_bridge_codex_exec_1780546631416_872460e2`.

Additional local verification after the live JSONL streaming and explicit context-envelope contract patch:

1. `npm run check:codex-bridge-contract-proof`
2. `npm run check:codex-bridge-operator-token-proof`
3. `npm run check:runtime-run-source-trace-proof`
4. `npx tsc --noEmit --pretty false`
5. embedded Codex exec command syntax parse
6. `git diff --check`

Additional verification after the operator-panel trigger and readback patch:

1. `npm run build`
2. `npm run check:codex-bridge-contract-proof`
3. `npm run check:codex-bridge-operator-token-proof`
4. `npm run check:runtime-run-source-trace-proof`
5. `npx tsc --noEmit --pretty false`
6. `CONVEX_DEPLOYMENT=dev:quick-porcupine-949 npx convex codegen`
7. `CONVEX_DEPLOYMENT=dev:quick-porcupine-949 npm run check:blaxel-staging-readiness`
8. Fresh operator-token-gated Codex exec smoke: `codex_bridge_codex_exec_1780574122135_c81a3441`
9. Fresh smoke ledger readback showed `codex_exec_stream_started`, four `codex_exec_jsonl:*` events, `codex_exec_final`, and `run_finished`.

The local smoke scripts read the operator secret from env and pass only a short-lived, scope-bound operator token to Convex. Internal-hidden smoke runs are operational evidence only; they must not mutate thread working memory or community source traces.

Additional verification after the async operator launcher patch:

1. `npm run build`
2. `npm run check:codex-bridge-contract-proof`
3. `npm run check:codex-bridge-operator-token-proof`
4. `npm run check:runtime-run-source-trace-proof`
5. `npx tsc --noEmit --pretty false`
6. `CONVEX_DEPLOYMENT=dev:quick-porcupine-949 npx convex codegen`
7. `CONVEX_DEPLOYMENT=dev:quick-porcupine-949 npm run check:blaxel-staging-readiness`
8. Fresh operator-token-gated Codex exec smoke after the shared launcher refactor: `codex_bridge_codex_exec_1780575084076_470dcbd2`

Next step before staging browser verification: confirm the `polynet-staging` Vercel project has built this branch through Git, ensure the staging user has an operator role in Convex, then open a staging workspace thread as an operator and run the Codex bridge control.

Additional verification after the explicit runtime-turn gate and Blaxel readiness hardening:

1. `npm run check:codex-bridge-contract-proof`
2. `npx tsc --noEmit --pretty false`
3. `git diff --check`
4. `npm run build`
5. `CONVEX_DEPLOYMENT=dev:quick-porcupine-949 npx convex dev --once --typecheck disable --codegen disable --tail-logs disable`
6. Runtime bridge flag confirmed disabled after probes: `POLYNET_ENABLE_CODEX_BRIDGE_RUNTIME_TURNS=false`
7. Runtime-authorized Codex bridge probe `codex_bridge_runtime_readiness_probe_17805877103N` reached `codex_bridge_context_fetched`, `codex_exec_invoked`, and `codex_exec_stream_started`, then stalled before final callback. Reconcile finished the run as `error` with provider code `blaxel_sandbox_not_ready`.
8. Non-Codex Blaxel process lifecycle probe `codex_bridge_blaxel_process_probe_17805885403N` started a trivial shell loop in the same project sandbox with `agent_run` lifecycle. Immediate read succeeded and saw the marker log. After 20 seconds, the second read and stop both failed with `blaxel_sandbox_not_ready`.
9. Follow-up 5-second probe `codex_bridge_blaxel_process_probe_17805885913N_5s` failed earlier at sandbox ensure with `blaxel_request_failed`.
10. Resource inventory reported the target project volume present, no provider sandboxes, and staging volume quota risk (`providerVolumeCount=5`, `providerVolumeLimit=5`, safety buffer 1).

Current read: the remaining blocker is Blaxel project-sandbox lifecycle/readback reliability, not Codex JSONL parsing or PolyNet context injection. Do not add more bridge harness logic until a trivial non-Codex process can survive and remain readable long enough for the runtime turn path.
