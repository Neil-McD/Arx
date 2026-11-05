# Production release 0ccfda4760e969af853d9d7a723a97535d17e95e

- Status: released
- Released origin/main SHA: 0ccfda4760e969af853d9d7a723a97535d17e95e
- Previous live SHA: cf0921bd9ade3cd66149545836a7981e47a7a917
- Convex: prod:wry-hawk-715
- Vercel project: polynet (prj_raxvbRAmEKdvqhAO8V6SnE9PrVir)
- Deployment: https://polynet-7nzxzhl14-neil-mcds-projects.vercel.app
- Rollback target: dpl_Hc54FGpHVPqn5Ya7xAvyEQ4177jt (https://polynet-gcwwgnioc-neil-mcds-projects.vercel.app)
  - `npm run release:rollback -- dpl_Hc54FGpHVPqn5Ya7xAvyEQ4177jt` (web only; Convex is not rolled back)

## Stages

- 2026-11-05T12:23:40.425Z guards
- 2026-11-05T12:23:40.584Z no_regress
- 2026-11-05T12:25:34.737Z release_gate
- 2026-11-05T12:25:49.048Z preflight
- 2026-11-05T12:26:05.257Z convex_deployed
- 2026-11-05T12:26:39.773Z web_deployed
- 2026-11-05T12:26:55.696Z live_verified

## Post-release smoke (fill in)

- [ ] Auth/session bootstrap
- [x] Changed surface verified: live version.json = 0ccfda476; production CSS serves Geist, the danger/success tokens, --surface-subtle and the light-mode tokens; favicon.svg?v=20261105a is the 1.3 KB vector mark. Pre-release backup ~/polynet-backups/polynet-prod-pre-visual-20261105.zip (104 MB, zip test ok, sha256 d54a88a1…).
