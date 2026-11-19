# Production release 3fc86c5a3e80b23452d49420bd382bb650d7bc0b

- Status: released
- Released origin/main SHA: 3fc86c5a3e80b23452d49420bd382bb650d7bc0b
- Previous live SHA: af039fdf77fa531985d4a3d2ddeb07877a0e80b7
- Convex: prod:wry-hawk-715
- Vercel project: polynet (prj_raxvbRAmEKdvqhAO8V6SnE9PrVir)
- Deployment: https://polynet-ez22y9zh7-neil-mcds-projects.vercel.app
- Rollback target: dpl_rWKZ5P2VQtbk3o642pEaiVXTVz1A (https://polynet-altf8dio8-neil-mcds-projects.vercel.app)
  - `npm run release:rollback -- dpl_rWKZ5P2VQtbk3o642pEaiVXTVz1A` (web only; Convex is not rolled back)

## Stages

- 2026-11-19T04:58:27.246Z guards
- 2026-11-19T04:58:27.465Z no_regress
- 2026-11-19T05:00:00.157Z release_gate
- 2026-11-19T05:00:03.987Z settings_parity
- 2026-11-19T05:00:05.426Z preflight
- 2026-11-19T05:00:16.321Z convex_deployed
- 2026-11-19T05:01:06.320Z web_deployed
- 2026-11-19T05:01:22.044Z live_verified

## Post-release smoke (fill in)

- [x] Auth/session bootstrap: www.polynet.ai loads signed in; `version.json` is 3fc86c5a3.
- [x] Changed surface verified (read-only, nothing posted, uploaded or changed): Home, Knowledge and Pods load; a course's lesson shows "Add a link" and "Add a file"; the Pods page lists its pod. The courses there are drafts, so the "who has started" list has nothing to show and was not exercised on production.
