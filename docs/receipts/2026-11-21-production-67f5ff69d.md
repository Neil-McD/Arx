# Production release 67f5ff69dcc2224d6a6a4390ae7f229c1e745e66

- Status: released
- Released origin/main SHA: 67f5ff69dcc2224d6a6a4390ae7f229c1e745e66
- Previous live SHA: 63f0a318cb9a977d3b95908e6132aedf327c75af
- Convex: prod:wry-hawk-715
- Vercel project: polynet (prj_raxvbRAmEKdvqhAO8V6SnE9PrVir)
- Deployment: https://polynet-hd9ei57ox-neil-mcds-projects.vercel.app
- Rollback target: dpl_5jdYPvYEwUiYCK5iqjbdC7iAEkqc (https://polynet-92jg6a4dm-neil-mcds-projects.vercel.app)
  - `npm run release:rollback -- dpl_5jdYPvYEwUiYCK5iqjbdC7iAEkqc` (web only; Convex is not rolled back)

## Stages

- 2026-11-21T18:38:07.186Z guards
- 2026-11-21T18:38:07.426Z no_regress
- 2026-11-21T18:39:51.277Z release_gate
- 2026-11-21T18:39:54.925Z settings_parity
- 2026-11-21T18:39:56.342Z preflight
- 2026-11-21T18:40:07.672Z convex_deployed
- 2026-11-21T18:44:09.304Z web_deployed
- 2026-11-21T18:44:25.207Z live_verified

## Post-release smoke (fill in)

- [x] Auth/session bootstrap: version.json shows 67f5ff69d; /runtime/mcp asks for sign-in; OpenAI's connector sign-in opened the AuthKit page with chatgpt.com's return address
- [x] Changed surface verified: /.well-known/openai-apps-challenge answers 200 text/plain with exactly the token; OpenAI's dashboard reports "Domain verified"
