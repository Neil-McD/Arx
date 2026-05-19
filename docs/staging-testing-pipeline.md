# Polynet Staging Testing Pipeline

This is the durable testing lane for large Polynet changes before broad production rollout.

## Purpose

Use staging when a change needs real integration proof across auth, Convex, Daytona, external providers, runtime execution, or feature flags.

Local development proves code. Staging proves the product flow. Production canary proves rollout safety.

## Canonical Staging Target

- Staging web target: `polynet-staging.vercel.app`
- Staging should be a persistent Vercel project or equivalent stable target, not an ad hoc preview URL.
- Staging should have its own coherent backend and provider configuration.
- Production remains Vercel project `polynet` on `origin/main`.

## Current Bootstrap State

As of May 14, 2026, the staging lane is bootstrapped as:

- Vercel project: `polynet-staging`
- Stable staging URL: `https://polynet-staging.vercel.app`
- Current backend: Convex cloud dev/staging deployment `quick-porcupine-949`
- Current Convex URL: `https://quick-porcupine-949.convex.cloud`
- Current Convex site URL: `https://quick-porcupine-949.convex.site`
- Daytona org ID: `c93629c5-b9eb-4980-93d3-e53a4401aa57`
- WorkOS/AuthKit staging redirect: `https://polynet-staging.vercel.app/api/auth/google/callback`
- Google OAuth provider: WorkOS staging Google provider uses the `Polynet` Google Cloud OAuth client, with the WorkOS callback URI authorized in Google Cloud.

This is a coherent staging lane for Codex harness testing, but the Convex layer is still the existing cloud dev deployment. When a separate Convex staging deployment exists, update this section and the Vercel environment variables together.

The staging Vercel project currently needs these production-scoped environment variables:

- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL`
- `VITE_PUBLIC_APP_URL`
- `ARX_AUTH_BRIDGE_SECRET`

The staging Convex deployment currently needs:

- `ARX_PUBLIC_APP_URL=https://polynet-staging.vercel.app`
- `VITE_PUBLIC_APP_URL=https://polynet-staging.vercel.app`
- `DAYTONA_API_KEY`
- `DAYTONA_API_URL`
- `DAYTONA_ORG_ID`
- `DAYTONA_SNAPSHOT`
- `OPENAI_API_KEY`
- `POLYNET_CODEX_HARNESS_ENABLED=true`
- `POLYNET_CODEX_HARNESS_PROBE_MODE=canary`
- `POLYNET_CODEX_HARNESS_EXECUTOR_ENABLED`
- `POLYNET_CODEX_HARNESS_PRIMARY_ENABLED`
- `POLYNET_STAGING_MAINTENANCE_ENABLED=true`

The staging maintenance token is intentionally temporary. The staging seed and smoke scripts create `POLYNET_STAGING_MAINTENANCE_TOKEN`, run the gated maintenance function, and remove the token unless `--keep-token` is passed.

## Deterministic Staging World

Staging should be production-shaped but isolated. The deterministic seed world is:

- Owner: `neilmcdevittd@gmail.com`
- Communities:
  - `Polynet` with slug `polynet`
  - `Distribution Engineering` with slug `distribution-engineering`
- Default project: `General`
- Codex harness flags: enabled, executor enabled, primary enabled, probe mode `canary`
- Daytona credentials: present in staging Convex
- ChatGPT provider connection: present for the staging owner

Repair or verify that world with:

```bash
npm run staging:seed-world
npm run check:staging-environment-smoke
```

Both commands default to Convex deployment `quick-porcupine-949` and `https://polynet-staging.vercel.app`. Override with `-- --deployment-name <name> --staging-url <url> --owner-email <email>` if the staging lane changes.

For this repo size, direct staging-project deploys from an isolated test worktree should use:

```bash
npx convex dev --once --typecheck disable
npx vercel deploy --prod --yes --archive=tgz
```

This command pair is for the `polynet-staging` project only. It is not the production release path for `polynet`.

## Environment Ladder

Use this ladder for major work:

1. `local dev`
2. `feature branch`
3. `staging`
4. `production canary`
5. `broad production`

Do not skip from local dev directly to broad production for changes that touch auth, billing, Daytona, Codex harness execution, MCP/app connections, runtime tools, or entitlement boundaries.

## Environment Contract

Keep one coherent truth per layer:

| Layer | Local | Staging | Production |
| --- | --- | --- | --- |
| Web | `localhost` | `polynet-staging.vercel.app` | `www.polynet.ai` / `polynet.ai` |
| Branch | feature/worktree | `staging` or staging deploy branch | `main` |
| Vercel | local server or preview | `polynet-staging` | `polynet` |
| Convex | dev only | staging deployment | production deployment |
| WorkOS/AuthKit | local/staging tenant | staging tenant | production tenant |
| Google OAuth | staging client | staging client | production client |
| Daytona | staging org/snapshot | staging org/snapshot | production org/snapshot |
| Stripe | test mode | test mode | live mode |
| Feature flags | developer-controlled | operator/canary enabled | off, operator-only, canary, then global |

If a test uses a mixed stack, state that explicitly before trusting the result.

## Standard Flow

1. Build the change in a feature branch or isolated worktree.
2. Run focused local checks and contract proofs.
3. Push to the staging branch or deploy to the staging project.
4. Deploy Convex staging intentionally when backend/runtime/schema code changed.
5. Verify staging environment fingerprints before browser testing.
6. Run the staging smoke checklist below.
7. Fix staging-only provider/config issues in the staging environment, not in production.
8. Merge/promote only after staging proof is clean.
9. Ship production with feature flags constrained to operator or canary users first.
10. Broaden production rollout only after production canary evidence is clean.

## Required Staging Smoke Checklist

Every major staging validation should record these outcomes:

1. Auth/session bootstrap works on `polynet-staging.vercel.app`.
2. Workspace loads as an authenticated user.
3. A basic workspace turn can be sent.
4. The changed runtime path is selected when its flag is enabled.
5. The fallback path still works when the flag is disabled or the runtime path fails.
6. Provider callbacks use staging URLs and staging provider clients.
7. Convex writes the expected durable evidence for the run.
8. No production tenant, production callback, or production secret is required to complete the staging test.

## Latest Staging Proof

May 14, 2026 validation against `https://polynet-staging.vercel.app`:

- Google OAuth login reached Google, returned through WorkOS, and landed in the signed-in PolyNet workspace.
- A real authenticated workspace thread was created: `6d05e300-e14e-441b-a8b8-78eb03dcc44b`.
- The user-visible response persisted successfully as `POLYNET_STAGING_AUTH_OK`.
- Convex run id: `agent_web:be28f5e9-958e-463d-b315-eea02eac7778`.
- Runtime evidence selected the Codex route as a candidate, but visible output still used `polynet_native` because the current browser turn was streaming and Codex primary is non-streaming only.
- Codex canary still executed in Daytona and reported `ready=true`, `codex-cli 0.114.0`, ChatGPT account resolved, rate limits present, and app-server startup successful.
- A second one-turn Codex primary visible canary was run from the same authenticated staging thread with the staging-only toggle enabled.
- The user-visible response persisted successfully as `POLYNET_CODEX_PRIMARY_OK`.
- Codex primary run id: `agent_web:fc55a04b-e456-426f-9300-0809fdb04f05`.
- Runtime evidence selected `codex_app_server`, used Daytona sidecar placement, resolved ChatGPT subscription auth, started `codex-cli 0.114.0`, completed with `status=ok`, and wrote the assistant response back to Convex.

## Codex Harness Staging Checklist

For Codex harness work, additionally verify:

1. `POLYNET_CODEX_HARNESS_ENABLED=true` in staging.
2. Probe mode is explicitly set, for example `POLYNET_CODEX_HARNESS_PROBE_MODE=canary`.
3. Daytona staging credentials are present.
4. The selected workspace can create or resume a Daytona sandbox.
5. The harness decision is visible in runtime evidence.
6. Codex shadow or primary execution emits observable events.
7. The legacy PolyNet harness fallback remains available.
8. The staging run can be repeated without manually repairing auth or provider config.

Use `POLYNET_CODEX_HARNESS_PROBE_MODE=tool_call_canary` only as a temporary diagnostic mode. It creates a short-lived marker file in the Daytona workspace, asks Codex app-server to read it through a read-only turn, records hash/length/tool-event evidence, and removes the file. Reset staging back to `canary` after the proof unless the current test specifically needs tool-call evidence.

For the Codex primary visible-turn canary, staging exposes the one-turn Codex primary toggle for signed-in users on `polynet-staging.vercel.app` without requiring a staging `operatorRoles` seed. The operator data panel remains operator-only, and production must not depend on this staging-only debug path.

The staging web bundle must send the explicit `codex_primary_canary` request flag for Codex primary visible-turn canaries. Runtime no longer infers a canary turn from non-streaming staging requests.

## Anti-Patterns

Avoid these patterns:

- Testing a major integration against random dev Convex and treating it as production evidence.
- Mixing local web, dev Convex, production WorkOS, and staging Google OAuth without saying so.
- Fixing provider redirects one by one during a feature test instead of repairing the environment contract.
- Treating a Vercel preview URL as a stable staging target.
- Enabling a new runtime globally in production before operator/canary proof.
- Deploying backend changes to production because staging is inconvenient.

## Promotion Rule

A feature is eligible for production only after:

1. Code checks pass locally.
2. Staging environment fingerprint is coherent.
3. Staging smoke checklist passes.
4. The feature has a rollback or flag-off path.
5. Production rollout starts operator-only or canary when the blast radius is meaningful.

If any of these are false, keep the change in staging.
