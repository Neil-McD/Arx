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

## Fly Runtime Shape

The worker is intentionally single-flight for this proof slice. Fly still allows limited concurrent HTTP requests so the app-level guard can return `409 worker_busy` immediately instead of letting fly-proxy queue the request.

Do not re-enable Fly HA, keep a warm Fly minimum, or set HTTP concurrency back to one until Convex owns queueing/routing for worker turns.

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
