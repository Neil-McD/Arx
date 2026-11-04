# Production release cf0921bd9ade3cd66149545836a7981e47a7a917

- Status: released
- Released origin/main SHA: cf0921bd9ade3cd66149545836a7981e47a7a917
- Previous live SHA: 7bf4dcefe27777bd2dd58e14fb8d675d31bbe077
- Convex: prod:wry-hawk-715
- Vercel project: polynet (prj_raxvbRAmEKdvqhAO8V6SnE9PrVir)
- Deployment: https://polynet-gcwwgnioc-neil-mcds-projects.vercel.app
- Rollback target: dpl_AKH8SQsN8wTgLq9MH2TxUye33uyn (https://polynet-aezoxszxh-neil-mcds-projects.vercel.app)
  - `npm run release:rollback -- dpl_AKH8SQsN8wTgLq9MH2TxUye33uyn` (web only; Convex is not rolled back)

## Stages

- 2026-11-04T23:24:49.775Z guards
- 2026-11-04T23:24:49.977Z no_regress
- 2026-11-04T23:26:33.941Z release_gate
- 2026-11-04T23:26:45.895Z preflight
- 2026-11-04T23:26:58.072Z convex_deployed
- 2026-11-04T23:27:39.712Z web_deployed
- 2026-11-04T23:27:40.416Z live_verified

## Post-release smoke (fill in)

- [ ] Auth/session bootstrap
- [x] Changed surface verified: live version.json = cf0921bd9; production CSS bundle serves the black-and-white dark tokens (--bg-app #08090a, --stroke-focus). Pre-release backup ~/polynet-backups/polynet-prod-pre-cf0921bd9-20261104.zip (104 MB, zip test ok, sha256 8b3e5489…).
