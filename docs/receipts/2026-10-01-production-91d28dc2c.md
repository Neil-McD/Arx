# Production release 91d28dc2c986ef88a8a507a269db710d6d28d878

- Status: released
- Released origin/main SHA: 91d28dc2c986ef88a8a507a269db710d6d28d878
- Previous live SHA: b9cffb46c49d0aa95d9b839c97c1b24af8dca003
- Convex: prod:wry-hawk-715
- Vercel project: polynet (prj_raxvbRAmEKdvqhAO8V6SnE9PrVir)
- Deployment: https://polynet-b91zf44h3-neil-mcds-projects.vercel.app
- Rollback target: dpl_FHB3HrciWYvVX2UqeVpZvhfGUorp (https://polynet-alinwwpcx-neil-mcds-projects.vercel.app)
  - `npm run release:rollback -- dpl_FHB3HrciWYvVX2UqeVpZvhfGUorp` (web only; Convex is not rolled back)

## Stages

- 2026-10-01T13:52:23.950Z guards
- 2026-10-01T13:52:24.186Z no_regress
- 2026-10-01T13:54:02.292Z release_gate
- 2026-10-01T13:54:17.965Z preflight
- 2026-10-01T13:54:37.886Z convex_deployed
- 2026-10-01T13:55:23.161Z web_deployed
- 2026-10-01T13:55:38.696Z live_verified

## Contents

- PR #163: default entry lands on the last visited community; mention past the Polynet home allowance shows the member notice with the Builder action.
- PR #164: DOMPurify 3.4.16 and brace-expansion 5.0.12 (new advisories had failed the release gate's web audit on the first attempt; nothing was deployed by that attempt).

## Post-release smoke

- [x] Auth/session bootstrap: signed-in session on www.polynet.ai, no console errors.
- [x] Changed surface verified: `www.polynet.ai/` as Neil now resolves to `/c/polynet/chat` (previously the newest owned test community, `workflow-sequence-acceptance-20260922`).
- Not exercised live: the mention allowance notice (requires a non-owner member at 25 turns this month); covered by `convex/communityAgentConcierge.test.ts`.
