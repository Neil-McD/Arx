# Production release d55eed47a3b61ef84c341f8ccbd01a68bf70800c

- Status: released
- Released origin/main SHA: d55eed47a3b61ef84c341f8ccbd01a68bf70800c
- Previous live SHA: 9d0ed36ab1511bbd4d5d9003f265d25f2bb11ff4
- Convex: prod:wry-hawk-715
- Vercel project: polynet (prj_raxvbRAmEKdvqhAO8V6SnE9PrVir)
- Deployment: https://polynet-6z7wljkke-neil-mcds-projects.vercel.app
- Rollback target: dpl_AEH8au7vgRnS2pXTnaBpeGRT8t64 (https://polynet-2wziwquo0-neil-mcds-projects.vercel.app)
  - `npm run release:rollback -- dpl_AEH8au7vgRnS2pXTnaBpeGRT8t64` (web only; Convex is not rolled back)

## Stages

- 2026-11-21T19:31:09.726Z guards
- 2026-11-21T19:31:09.886Z no_regress
- 2026-11-21T19:32:48.287Z release_gate
- 2026-11-21T19:32:51.805Z settings_parity
- 2026-11-21T19:32:53.175Z preflight
- 2026-11-21T19:33:03.680Z convex_deployed
- 2026-11-21T19:33:41.253Z web_deployed
- 2026-11-21T19:33:56.873Z live_verified

## Post-release smoke (fill in)

- [x] Auth/session bootstrap: version.json shows d55eed47a; OpenAI's rescan signed in as the reviewer
- [x] Changed surface verified: OpenAI's MCP scan of every tool reports "No findings in the latest MCP scan" (#719: per-job course tools for outside AIs, update_community open-world)
