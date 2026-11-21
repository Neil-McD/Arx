# Production release 0e20dc5bccf74409de115dcac95aefef683e9fc2

- Status: released
- Released origin/main SHA: 0e20dc5bccf74409de115dcac95aefef683e9fc2
- Previous live SHA: 11c0a45039b5aa45b2963e1c7feb981bb30e1288
- Convex: prod:wry-hawk-715
- Vercel project: polynet (prj_raxvbRAmEKdvqhAO8V6SnE9PrVir)
- Deployment: https://polynet-7wekujkcm-neil-mcds-projects.vercel.app
- Rollback target: dpl_FiQQECUkfsbbVnmoMTW9JGHep2VS (https://polynet-bl2qte97s-neil-mcds-projects.vercel.app)
  - `npm run release:rollback -- dpl_FiQQECUkfsbbVnmoMTW9JGHep2VS` (web only; Convex is not rolled back)

## Stages

- 2026-11-19T21:07:14.077Z guards
- 2026-11-19T21:07:14.311Z no_regress
- 2026-11-19T21:08:52.526Z release_gate
- 2026-11-19T21:08:56.671Z settings_parity
- 2026-11-19T21:08:58.105Z preflight
- 2026-11-19T21:09:09.610Z convex_deployed
- 2026-11-19T21:10:50.067Z web_deployed
- 2026-11-19T21:11:05.673Z live_verified

## Post-release smoke (fill in)

- [x] Auth/session bootstrap: version.json shows 0e20dc5bc; /runtime/mcp answers 401 with OAuth metadata; Claude Code lists 34 tools from production and polynet_list / works
- [x] Changed surface verified: a v1 privacy acceptance counts again (staging: posting through an AI works after the backend update; contract tests cover it); /privacy shows v2
