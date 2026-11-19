# Production release 6b1ad9ba02c423c505ef44e32d5e6b993c808d7a

- Status: released
- Released origin/main SHA: 6b1ad9ba02c423c505ef44e32d5e6b993c808d7a
- Previous live SHA: 7e759780d081842344eb95d53d34b37937e5383c
- Convex: prod:wry-hawk-715
- Vercel project: polynet (prj_raxvbRAmEKdvqhAO8V6SnE9PrVir)
- Deployment: https://polynet-ibunhxjs3-neil-mcds-projects.vercel.app
- Rollback target: dpl_CADfHWRayKsWVoJbkpwE9ky1J5Qe (https://polynet-4kf7c2f4w-neil-mcds-projects.vercel.app)
  - `npm run release:rollback -- dpl_CADfHWRayKsWVoJbkpwE9ky1J5Qe` (web only; Convex is not rolled back)

## Stages

- 2026-11-19T16:47:27.611Z guards
- 2026-11-19T16:47:27.850Z no_regress
- 2026-11-19T16:49:38.748Z release_gate
- 2026-11-19T16:49:43.661Z settings_parity
- 2026-11-19T16:49:45.570Z preflight
- 2026-11-19T16:49:58.958Z convex_deployed
- 2026-11-19T16:50:38.336Z web_deployed
- 2026-11-19T16:50:54.033Z live_verified

## Post-release smoke (fill in)

- [x] Auth/session bootstrap: signed in on www.polynet.ai; General loaded with no console errors (read-only).
- [x] Changed surface verified: build 6b1ad9ba0 live. A real MCP client (this app's Polynet connector, production OAuth token) listed `/` through `/runtime/mcp`, so the door's own token check accepts production tokens (read-only). The three changes (MCP token works at the door only, truthful tool labels, per-person retry keys / named tools only / argument checks) were checked live on staging with a real Claude client before release.
