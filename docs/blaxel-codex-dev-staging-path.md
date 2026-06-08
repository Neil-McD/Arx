# Blaxel Codex Dev And Staging Path

This is the path contract for Codex-on-Blaxel staging work. Treat it as a hard boundary, not a preference.

## Local Development

- Worktree: `/Users/neilmcdevitt/code/arx-codex-blaxel-staging`
- Branch: `codex/blaxel-staging-active-20260608`
- Base build: `00d4eb21d52c8a454e841448d46422f15765a088`
- Purpose: Codex-on-Blaxel runtime, streaming, OAuth bridge, runtime accounting, and staging-only validation.

Run this before any Blaxel/Codex staging proof, smoke, commit, or deploy handoff:

```bash
cd /Users/neilmcdevitt/code/arx-codex-blaxel-staging
npm run check:blaxel-staging-worktree
```

## Staging Targets

- Web project: `polynet-staging`
- Web URL: `https://polynet-staging.vercel.app`
- Convex deployment: `dev:quick-porcupine-949`
- Codex/Blaxel bridge smoke: `npm run smoke:codex-blaxel-runtime-bridge-staging`
- Codex/Blaxel latency probe: `npm run probe:codex-blaxel-runtime-latency-staging -- --thread-key <threadKey>`
- Latency probe data comes from `codexBlaxelRuntimeLatencyProbe:getCodexBlaxelRuntimeLatencyProbeDataInternal` and includes bridge prep sub-phases for directory prep plus auth/runtime payload writes.

Staging web releases must be built from `/Users/neilmcdevitt/code/arx-codex-blaxel-staging`. Do not deploy staging from the root worktree, a detached temp worktree, or `main`.

## Production Targets

- Git branch: `origin/main`
- Web project: `polynet`
- Web URL: `https://www.polynet.ai`
- Convex deployment: `prod:wry-hawk-715`

Production fixes belong on `main` through the production release workflow. Do not mix production hotfixes into the Blaxel staging worktree unless intentionally cherry-picked or merged after review.

## Forbidden For Blaxel Staging Work

- `/Users/neilmcdevitt/code/arx`
- `/Users/neilmcdevitt/code/arx-blaxel-stage`
- `/Users/neilmcdevitt/code/arx-codex-blaxel-bridge`
- `/private/tmp/arx-staging-*`
- `/private/tmp/arx-partner-refresh-live-20260608`
- Any detached worktree
- Any worktree whose current branch is `main`

## Non-Negotiable Checks

Before claiming staging readiness:

1. `npm run check:blaxel-staging-worktree`
2. Relevant Codex/Blaxel contract proofs
3. `npm run check:web-typecheck`
4. `npm run build`
5. A staging URL marker check against `https://polynet-staging.vercel.app/version.json`

If any command is run from the wrong path, stop and move to the correct worktree before continuing.
