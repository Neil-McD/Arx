# Production release b9cffb46c49d0aa95d9b839c97c1b24af8dca003

- Status: released
- Released origin/main SHA: b9cffb46c49d0aa95d9b839c97c1b24af8dca003
- Previous live SHA: 9077da93b991e1fa5589b4bfc551a47342a1646a
- Convex: prod:wry-hawk-715
- Vercel project: polynet (prj_raxvbRAmEKdvqhAO8V6SnE9PrVir)
- Deployment: https://polynet-alinwwpcx-neil-mcds-projects.vercel.app
- Rollback target: dpl_Fmv29r5JbB9jzHbXxrPYedT8QxVp (https://polynet-7llxqpy8a-neil-mcds-projects.vercel.app)
  - `npm run release:rollback -- dpl_Fmv29r5JbB9jzHbXxrPYedT8QxVp` (web only; Convex is not rolled back)

## Stages

- 2026-09-28T16:28:07.527Z guards
- 2026-09-28T16:28:07.742Z no_regress
- 2026-09-28T16:29:55.131Z release_gate
- 2026-09-28T16:30:06.216Z preflight
- 2026-09-28T16:30:21.879Z convex_deployed
- 2026-09-28T16:32:19.508Z web_deployed
- 2026-09-28T16:32:20.199Z live_verified

## Post-release smoke

- [x] Auth/session bootstrap: signed-in session on www.polynet.ai; `/c/polynet/chat` renders General; no console errors.
- [x] Changed surface verified: this release changes only the release path. It is the first release through `npm run release:prod`. Merging PR #161 created no production deployment (Git auto-deploy from `main` disabled); the command deployed Convex, then web, and `version.json` reports this SHA with the production Convex URL in the live bundle.
- Not exercised: rollback (`release:rollback`) against production.
