# Production release 2ea6f293e841a41893748e9bcdaeb45db21906fb

- Status: released
- Released origin/main SHA: 2ea6f293e841a41893748e9bcdaeb45db21906fb
- Previous live SHA: 0e20dc5bccf74409de115dcac95aefef683e9fc2
- Convex: prod:wry-hawk-715
- Vercel project: polynet (prj_raxvbRAmEKdvqhAO8V6SnE9PrVir)
- Deployment: https://polynet-9atzadw8g-neil-mcds-projects.vercel.app
- Rollback target: dpl_FGEEpzqTapGhdyXhMaDdKSsvmWZF (https://polynet-7wekujkcm-neil-mcds-projects.vercel.app)
  - `npm run release:rollback -- dpl_FGEEpzqTapGhdyXhMaDdKSsvmWZF` (web only; Convex is not rolled back)

## Stages

- 2026-11-19T23:17:55.456Z guards
- 2026-11-19T23:17:55.749Z no_regress
- 2026-11-19T23:19:46.353Z release_gate
- 2026-11-19T23:19:50.476Z settings_parity
- 2026-11-19T23:19:52.005Z preflight
- 2026-11-19T23:20:02.434Z convex_deployed
- 2026-11-19T23:22:50.709Z web_deployed
- 2026-11-19T23:22:51.274Z live_verified

## Post-release smoke (fill in)

- [x] Auth/session bootstrap: version.json shows 2ea6f293e; /api/auth/session answers 200; /runtime/mcp answers 401 to an unsigned request; Claude Code lists communities through production
- [x] Changed surface verified: /terms shows v5; /ai, /privacy and /terms footers name EXECUTIVEINTELLIGENCE LLC; on staging an account that accepted v4 terms and v1 privacy goes straight in. The review demo seed is inert on production (POLYNET_ALLOW_REVIEW_DEMO not set)
