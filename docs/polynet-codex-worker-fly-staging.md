# PolyNet Codex Worker Fly Staging

This is the staging-only path for the PolyNet-owned headless Codex worker.

## Boundary

- Runtime owner: PolyNet worker on Fly.
- Execution environment: Blaxel sandbox through `blaxel_bash`.
- Codex local worker access: read-only, no network.
- Model default: `gpt-5.5`.
- Convex target: `dev:quick-porcupine-949`.
- Fly app: `polynet-codex-worker-staging`.
- Fly region: `sjc`.
- Fly machine count: zero always-on workers; one staging worker autostarts and autosuspends, deployed with `--ha=false`.
- Blaxel execution sandbox default: 2GB memory.

Do not use this config for `origin/main`, `www.polynet.ai`, Convex prod `wry-hawk-715`, or Vercel project `polynet`.

## Required Fly Secrets

Set exactly one Codex auth path:

- `CODEX_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- `CODEX_AUTH_JSON_BASE64`

Also required:

- `POLYNET_CODEX_WORKER_AUTH_TOKEN`
- `BL_WORKSPACE`
- `BL_API_KEY`

Optional:

- `BLAXEL_WORKSPACE_REGION`

The worker entrypoint logs into Codex, then unsets `CODEX_ACCESS_TOKEN`, `OPENAI_API_KEY`, and `CODEX_AUTH_JSON_BASE64` before starting the HTTP service.

## Required Convex Env

The staging Convex deployment must hold:

- `POLYNET_CODEX_WORKER_RUNTIME_ENABLED=true`
- `POLYNET_DEPLOYMENT_KIND=staging`
- `POLYNET_CODEX_WORKER_URL=https://polynet-codex-worker-staging.fly.dev`
- `POLYNET_CODEX_WORKER_AUTH_TOKEN`
- `POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET`

The worker receives and relays short-lived run tokens, but only Convex holds
`POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET`.

## Fly Runtime Shape

Each machine is single-flight; concurrency comes from a pool of suspended
machines. `soft_limit = 1` makes a machine running one turn a route-away
target, so fly-proxy sends new turns to idle machines and autostarts
suspended pool members on demand — fly-proxy is the scheduler, no queueing
code exists. `hard_limit` stays high so requests pinned to a busy machine
(cancel, probes) still reach the app-level `409 worker_busy` guard.

Cancel affinity: the worker reports its `machine_id` (start event, summary,
healthz) and the bridge pins `/v1/codex/turn/cancel` to that machine with the
`fly-force-instance-id` header.

Scale the pool with `fly machine clone` / `fly machine destroy`; deploys
update every machine in the app. Suspended machines cost rootfs storage only.
Machines are shared-cpu-1x with 1024MB. The worker is a single-flight
I/O-bound broker (inference and execution are remote): measured 142MB peak
under a live turn. Fly only suspends machines at or below 2GB — larger sizes
silently fall back to stopped (full cold boot + Codex login on wake, which is
what the bridge's busy-retry ladder absorbs) — and smaller RAM images resume
faster from suspend. v20 acceptance: remote multi-machine contract PASS at
this size; measured wake-from-suspend 0.35s (was 0.61s at 4096MB), suspend
after ~5min idle.
Staging pool: 10 machines.

Concurrency caps (Convex admission, `shared/polynetCodexWorkerLimits.ts`):
5 concurrent runs per project, 10 per user (bound to the pool size — each
run occupies one single-flight machine; raise both together), counted over
a 20-minute
startedAt window so zombie runs cannot hold slots. Concurrent runs on one
project share the project sandbox and its volume — parallel agents in one
workspace, not parallel sandboxes. Over-limit turns fail fast with
`project_run_limit_reached` / `user_run_limit_reached` (429). The effective
per-user parallelism ceiling is their own ChatGPT plan's rate limits.

## Workspace Serve (run apps with live preview)

Project-bound worker turns expose a second dynamic tool, `workspace_serve`
(`command`, `port`). The worker forwards it to the Convex bridge endpoint
`/runtime/polynet_codex_worker_terminal` (worker bearer + a short-lived
Convex-minted `terminal` run token + the same run-record validation as
ingest), which starts the process through the shared
`startWorkspaceTerminalProcess` core. That creates a real terminal row — the
background-terminal rail and the workspace app preview panel light up natively
— and returns the access-gated preview proxy URL, never a raw provider URL.
The worker emits `workspace_serve_requested/finished` and
`workspace_preview_ready` run events. Served apps ride the sandbox standby
lifecycle: idle apps cost ~nothing and wake on request.

## Proof Hierarchy

"All proofs green" means exactly one thing: the acceptance gate passes.

```bash
POLYNET_CODEX_WORKER_AUTH_TOKEN=... \
npm run check:polynet-codex-worker-acceptance
```

Acceptance gates (each buys confidence in the deployed architecture):
diff hygiene, staging guard, Fly config proof, Convex bridge contract,
provider cost accounting, workspace credit accounting, Blaxel lifecycle
accounting, workspace resource admission, runtime turn contract guard, web
typecheck, web build, and the live remote Fly contract with
`POLYNET_CODEX_WORKER_EXPECT_MULTI_MACHINE=true` (Fly routing, stopped-machine
wake, Codex boot, Blaxel execution, cancel affinity, minimal public health,
run-token rejection for worker-only forged platform calls, lifecycle events).

Dev conveniences (never gates; if one breaks for environmental reasons twice,
delete it instead of fixing it):
`check:polynet-codex-worker-service-contract` (local worker iteration),
`run_polynet_codex_worker_poc.sh`, and ad hoc local smoke loops.

## Local Config Proof

```bash
cd /Users/neilmcdevitt/code/arx-polynet-codex-worker
npm run check:polynet-codex-worker-staging
npm run check:polynet-codex-worker-fly-config
```

## Deploy

Create the Fly app only if it does not already exist:

```bash
POLYNET_CODEX_WORKER_FLY_CREATE_APP=true \
npm run deploy:polynet-codex-worker-fly-staging
```

After the app exists:

```bash
npm run deploy:polynet-codex-worker-fly-staging
```

## Remote Proof

```bash
POLYNET_CODEX_WORKER_URL=https://polynet-codex-worker-staging.fly.dev \
npm run check:polynet-codex-worker-fly-staging-contract
```

The proof checks:

- `/healthz` returns Codex initialized and Blaxel configured.
- Missing bearer auth returns `401`.
- Invalid sandbox names return `400`.
- Concurrent turns return `409 worker_busy`.
- Stream includes `run_model_finished`, `sandbox_destroy_finished`, and `run_finalized`.
- Final timing includes `sandbox_destroy_ms`.

## Measured Staging Evidence (2026-06-10, release v5)

Remote contract proof probe turn, autosleep + 2GB config live:

- `sandbox_ensure_ms`: 379
- `codex_thread_start_ms`: 22
- `codex_turn_start_ack_ms`: 14
- `first_blaxel_tool_call_ms`: 2595
- `latest_blaxel_tool_latency_ms`: 378
- `first_assistant_delta_ms`: 3712
- `codex_turn_total_ms`: 4687
- `sandbox_destroy_ms`: 73

Fly autosuspend/autostart cycle:

- Machine autosuspended after ~290s idle.
- Wake from suspended via fly-proxy: 0.61s to `/healthz` 200 (warm baseline 0.22s).

Implications: per-turn sandbox overhead (ensure + destroy) is ~450ms; probe-turn
sandbox lifetime ~4.5s; the suspended-worker wake tax is ~0.4s.

## Codex Defaults (release v6, 2026-06-10)

The entrypoint writes `$CODEX_HOME/config.toml` before login:

- `model = "gpt-5.5"` (from `POLYNET_CODEX_WORKER_MODEL`)
- `approval_policy = "never"`
- `project_doc_max_bytes = 0` (AGENTS.md/project-doc injection disabled)

The image no longer copies the repo `AGENTS.md`, and Codex runs from the empty
`/app/agent-cwd` (`POLYNET_CODEX_WORKER_AGENT_CWD`) so local source and project
docs never enter user turns. Users get gpt-5.5 + full-access execution with no
UI configuration.

Verified by probe on v6: Blaxel sandbox `/workspace` has write access, outbound
HTTPS (200 from example.com), bash, git, Python 3.12.13, Node 24.16.0. `curl`
and `wget` are not in the sandbox image yet. Timing unchanged
(`sandbox_ensure_ms` 388, `sandbox_destroy_ms` 67).

## BYOK Per-Turn Auth (release v7, 2026-06-10)

`/v1/codex/turn` requires `chatgpt_auth` in the request body:

- `access_token`: the user's ChatGPT OAuth JWT
- `chatgpt_account_id`: the user's workspace id
- `chatgpt_plan_type`: optional

Turns without it return `400 chatgpt_auth_required`. The Convex bridge mints
fresh tokens per turn via `getFreshChatgptAuthForUser` and only routes
`chatgpt`-lane turns to the worker; users without a ChatGPT connection fail
closed with `provider_connection_required`. The worker logs into Codex with
`account/login/start` (`chatgptAuthTokens`) before each turn and logs out in
the turn's cleanup, emitting `codex_account_login_finished` /
`codex_account_logout_finished` events and a `codex_account_login_ms` timing
bucket. Mid-turn `account/chatgptAuthTokens/refresh` requests are answered
with an error (no refresh tokens leave Convex); tokens are minted with ~60s
expiry headroom at turn start.

The machine-level Codex secret (`CODEX_ACCESS_TOKEN` et al.) is now
probe-only fallback: during any user turn, `$CODEX_HOME/auth.json` holds that
user's own token, so the prior shared-token read exposure is closed. Removing
the boot login entirely (probe also carrying auth) is a candidate follow-up.

## Sandbox Readiness and Lifecycle (release v10, 2026-06-10)

Incident evidence: a project sandbox wedged in `DEPLOYING` for 30+ minutes
because the Blaxel SDK's `sandbox.wait()` is a deprecated no-op, the SDK and
the Convex client both defaulted to 4096MB (the 2GB slice had only changed
the worker env), and the 10m agent_run idle-delete forced cold
create-with-volume into the everyday turn path.

Current contract:

- `waitForBlaxelSandboxReady` polls provider status; null/transitional states
  are never ready. Ensure replaces terminal or stuck sandboxes (volume
  survives), settles 5s before recreation, and fails loudly with
  `blaxel_sandbox_deploy_timeout` if a fresh create never deploys.
- Command execution gates on readiness (`blaxel_sandbox_not_ready`) instead of
  404ing into `blaxel_sandbox_not_found`.
- The worker passes `requireExisting` for Convex-provided sandbox names: Convex
  is the only creator of project sandboxes.
- Memory is 2048MB everywhere (code fallback + `BLAXEL_WORKSPACE_MEMORY_MB`
  on Convex staging and the worker).
- agent_run idle delete is 48h; Blaxel standby ($0 compute) is the idle state.

Verified E2E: the wedged 4096MB sandbox was detected, replaced, and the
project volume remounted with all files intact at 2048MB.

## Durable Ingest Backstop (release v12, 2026-06-10)

The Convex turn action still proxies the worker SSE stream for live UX, but
durability no longer depends on it. The bridge hands the worker an ingest
target (`CONVEX_SITE_URL` + `/runtime/polynet_codex_worker_ingest`, shared
worker bearer token), short-lived audience tokens signed with
`POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET`, plus an opaque context
(owner/thread/run ids, the assistant message key, model/lane). After
`run_finalized` the worker posts its final payload (all runtime events,
assistant text, status, timing) directly to Convex with up to 3 retries.

The ingest handler is idempotent against the live path: events dedupe on the
same eventKey scheme, the assistant message dedupes on messageKey, and run
finish is best-effort. It accepts only the broad worker bearer plus a valid
`ingest` run token, then validates the live run row before writing. If the
Convex action dies mid-turn, the worker's push still lands the completed turn
and the existing UI recovery picks it up.

Worker service log events: `ingest_push_succeeded` / `ingest_push_failed`.

## Cancellation and Turn Lifecycle (release v13, 2026-06-10)

- `POST /v1/codex/turn/cancel` (bearer auth, `run_id`) interrupts the active
  Codex turn via `turn/interrupt`; mismatched run ids return `409
  no_matching_turn`. Cancelled turns finalize with `user_cancelled`, settle
  the sandbox lease, log out, and push ingest like any other turn.
- The Convex worker path polls run cancellation every 3s while proxying the
  stream and fires the cancel endpoint when the user stops the turn; cancelled
  results persist through the partial-cancelled path, not as errors.
- Turn completion timeout is `POLYNET_CODEX_WORKER_TURN_TIMEOUT_SECONDS`
  (default 900). On timeout the worker interrupts the orphaned Codex turn
  before failing so it cannot keep consuming the user's ChatGPT quota.
- Remote contract proof covers: cancel 409 on unknown run, mid-flight cancel
  finalizing fast with `user_cancelled`, and the worker accepting the next
  turn immediately after.
