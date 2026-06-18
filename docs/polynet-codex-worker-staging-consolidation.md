# PolyNet Codex Worker Staging Consolidation

## Scope

This worktree is a local staging-only consolidation lane.

- Worktree: `/Users/neilmcdevitt/code/arx-polynet-codex-worker-staging-consolidation`
- Branch: `codex/polynet-codex-worker-staging-consolidation-20260618`
- Base ref: `origin/main` at `96141710`
- Donor ref: `codex/polynet-worker-prod-rail-20260611`
- Staging Vercel project: `polynet-staging`
- Staging Vercel project id: `prj_plXUH12pm9nZ5lWS5wJOt163maFL`
- Staging Vercel org id: `team_TJvbi4UGtg62xteusiC1Cvxy`
- Staging web URL: `https://polynet-staging.vercel.app`
- Staging Convex deployment: `dev:quick-porcupine-949`
- Staging Fly app: `polynet-codex-worker-staging`

`polynet-staging` is the canonical Vercel project name for this lane. `PolyAppStage`
is only an informal label if it appears in conversation; it must not appear in
`.vercel/project.json` or guard constants.

## First Slice

Import only the staging worker substrate:

- `services/polynet-codex-worker/**`
- `shared/workspacePreviewPort.ts`
- staging Fly config/proof scripts
- local worker service script
- staging worker documentation

No runtime turn routing, UI, Convex bridge wiring, production rail, deploy, or live smoke is part of the first slice.

## Forbidden

- Do not push or deploy from this slice.
- Do not touch `origin/main`.
- Do not target Vercel project `polynet`.
- Do not target Vercel project `PolyAppStage`.
- Do not target Convex production `prod:wry-hawk-715`.
- Do not import `services/polynet-codex-worker/fly.production.toml`.
- Do not import production worker scripts.

## Acceptance

```bash
npm run check:polynet-codex-worker-staging
npm run check:polynet-codex-worker-stage-identity
npm run check:polynet-codex-worker-fly-config
```
