# Production release 2ed77b67e5824920784fccfebe72450134c1a076

- Status: released
- Released origin/main SHA: 2ed77b67e5824920784fccfebe72450134c1a076
- Previous live SHA: d55eed47a3b61ef84c341f8ccbd01a68bf70800c
- Convex: prod:wry-hawk-715
- Vercel project: polynet (prj_raxvbRAmEKdvqhAO8V6SnE9PrVir)
- Deployment: https://polynet-n20lqaxlz-neil-mcds-projects.vercel.app
- Rollback target: dpl_2bgnATV5x1M6pwW32LxDwcmPvzL4 (https://polynet-6z7wljkke-neil-mcds-projects.vercel.app)
  - `npm run release:rollback -- dpl_2bgnATV5x1M6pwW32LxDwcmPvzL4` (web only; Convex is not rolled back)

## Stages

- 2026-11-21T19:50:22.061Z guards
- 2026-11-21T19:50:22.267Z no_regress
- 2026-11-21T19:52:00.519Z release_gate
- 2026-11-21T19:52:04.257Z settings_parity
- 2026-11-21T19:52:05.740Z preflight
- 2026-11-21T19:52:16.747Z convex_deployed
- 2026-11-21T19:52:56.380Z web_deployed
- 2026-11-21T19:53:11.962Z live_verified

## Post-release smoke (fill in)

- [x] Auth/session bootstrap: version.json shows 2ed77b67e; ChatGPT (custom MCP, signed in as the reviewer) runs Polynet tools
- [x] Changed surface verified: the new instructions are served (#721); OpenAI draft 1.0.1 uploaded with the reworded test case 4
