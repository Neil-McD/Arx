# PolyNet Codex Worker Production Rail

This is the disabled-by-default production path for the PolyNet-owned headless
Codex worker.

## Boundary

- Canonical web release path: GitHub `main` deploys Vercel project `polynet`.
- Convex production deployment: `prod:wry-hawk-715`.
- Fly production app: `polynet-codex-worker`.
- Fly production config: `services/polynet-codex-worker/fly.production.toml`.
- Staging Fly app remains `polynet-codex-worker-staging`.
- Staging Convex remains `dev:quick-porcupine-949`.

Do not use the staging worker worktree, staging branch family, staging Fly app,
or staging Convex deployment for production worker work.

## Current State

The production rail exists, but it is not enabled by default.

The Convex bridge still requires all of these server-side env values before it
routes a turn to the worker:

- `POLYNET_CODEX_WORKER_RUNTIME_ENABLED=true`
- `POLYNET_DEPLOYMENT_KIND=production`
- `POLYNET_CODEX_WORKER_URL=https://polynet-codex-worker.fly.dev`
- `POLYNET_CODEX_WORKER_AUTH_TOKEN`
- `POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET`

If the runtime flag is missing, the bridge returns disabled. If production env
points at a staging-looking URL, the bridge returns
`polynet_codex_worker_production_env_mismatch`. If staging env points at a
production-looking URL, the bridge returns
`polynet_codex_worker_staging_env_mismatch`.

`POLYNET_CODEX_WORKER_AUTH_TOKEN` is the broad worker-to-Convex transport
bearer. `POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET` stays only in Convex and signs
short-lived per-run tokens for `ingest`, `terminal`, and `tool` calls; the
worker relays those tokens but cannot mint them. Run tokens default to a
45-minute TTL. Convex always mints `ingest`; it mints `terminal` only for
project-bound workspace turns, and `tool` only when platform tools are
actually projected.

## Static Readiness Gate

This gate does not deploy, promote, alias, or enable production traffic:

```bash
npm run check:polynet-codex-worker-production-static-acceptance
```

It proves diff hygiene, the production guard, production Fly config, Convex
bridge contract, production workspace-provider preflights, web typecheck, and
web build.

This gate is PR-safe and static-only. Passing it does not mean the production
Fly worker has served a live turn.

## Production Deploy Command

Run only from the validated production code state, after the production rail is
approved:

```bash
npm run deploy:polynet-codex-worker-fly-production
```

The deploy command refuses:

- the staging worktree
- the staging worker branch family
- `dev:quick-porcupine-949`
- `polynet-codex-worker-staging`
- `services/polynet-codex-worker/fly.toml`
- a Vercel link to `polynet-staging`

Required secrets are the same as staging: `POLYNET_CODEX_WORKER_AUTH_TOKEN`,
`BL_WORKSPACE`, `BL_API_KEY`, and exactly one Codex auth path
(`CODEX_ACCESS_TOKEN`, `OPENAI_API_KEY`, or `CODEX_AUTH_JSON_BASE64`).

## Live Production Proof

After the production Fly app exists and Convex production env is intentionally
configured, run the final production acceptance gate:

```bash
npm run check:polynet-codex-worker-production-acceptance
```

This command is non-deploying, but it is not optional or static-only: it runs
the static readiness gate first, then runs the live production Fly worker
contract proof. The underlying script fails closed unless
`POLYNET_PRODUCTION_ACCEPTANCE_REMOTE=true`.

The live stage targets:

- worker URL: `https://polynet-codex-worker.fly.dev`
- ingest URL:
  `https://wry-hawk-715.convex.site/runtime/polynet_codex_worker_ingest`

## Remaining Manual Steps Before Enabling

1. Merge the production rail through GitHub into `main`.
2. Let Vercel project `polynet` deploy from GitHub; do not use local Vercel
   deploy/promote/alias commands.
3. Deploy the production Fly worker app with the production deploy command.
4. Set Convex production env for the worker URL, worker token, run-token
   secret, deployment kind, and runtime flag.
5. Run `npm run check:polynet-codex-worker-production-acceptance`.
6. Do one real production turn with a low-risk test account and verify run
   events, assistant persistence, billing settlement, and worker logs.
