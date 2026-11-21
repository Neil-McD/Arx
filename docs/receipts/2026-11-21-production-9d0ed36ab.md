# Production release 9d0ed36ab1511bbd4d5d9003f265d25f2bb11ff4

- Status: released
- Released origin/main SHA: 9d0ed36ab1511bbd4d5d9003f265d25f2bb11ff4
- Previous live SHA: 65b834df49f47a6fab92f357f0ee2da9fea642b3
- Convex: prod:wry-hawk-715
- Vercel project: polynet (prj_raxvbRAmEKdvqhAO8V6SnE9PrVir)
- Deployment: https://polynet-2wziwquo0-neil-mcds-projects.vercel.app
- Rollback target: dpl_Lm4Vk3HRRHMHZhecgBp4vdS1H6PU (https://polynet-pd49znjzt-neil-mcds-projects.vercel.app)
  - `npm run release:rollback -- dpl_Lm4Vk3HRRHMHZhecgBp4vdS1H6PU` (web only; Convex is not rolled back)

## Stages

- 2026-11-21T19:13:11.693Z guards
- 2026-11-21T19:13:11.850Z no_regress
- 2026-11-21T19:14:47.299Z release_gate
- 2026-11-21T19:14:50.897Z settings_parity
- 2026-11-21T19:14:52.294Z preflight
- 2026-11-21T19:15:02.189Z convex_deployed
- 2026-11-21T19:15:40.021Z web_deployed
- 2026-11-21T19:15:55.916Z live_verified

## Post-release smoke (fill in)

- [x] Auth/session bootstrap: version.json showed 9d0ed36ab; OpenAI's connector stayed Authorized as the reviewer
- [x] Changed surface verified: the seed found the reviewer by WorkOS id (#717) and created Harbor Run Club on production: 6 members, 2 join requests, 5 posts, 2 events, a 3-lesson course, 2 DMs
