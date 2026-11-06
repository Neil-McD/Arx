# Production release 0dc2cb85ab5629152dd8280b9c744a77a3341413

- Status: released (web deploy completed after the release script lost its connection to Vercel; verified with `npm run release:verify -- --allow-same-build`)
- Released origin/main SHA: 0dc2cb85ab5629152dd8280b9c744a77a3341413
- Previous live SHA: e46d842e9bc04877bbc47954b3cb72f88c4901fe
- Convex: prod:wry-hawk-715
- Vercel project: polynet
- Deployment: https://polynet-9oamwva2v-neil-mcds-projects.vercel.app (dpl_AxtUZgdGqmwdWeqvrUtmh4TMSW5S)
- Rollback target: dpl_68oaysgbFzeJ6T7yo2ACMm8XyaT1
  - `npm run release:rollback -- dpl_68oaysgbFzeJ6T7yo2ACMm8XyaT1` (web only; Convex is not rolled back)

## What shipped

#357 settings parity, #358 receipt, #360 paid leave keeps access to period end, #361 Stripe's notice grants membership / duplicates refunded / prices locked, #362 and #366 cash first on community sites, #363 the checkout grants membership (purchase claims retired, stubs kept one release), #364 no setup form (starter profile, Join accepts the terms), #367 blocked buyers refunded and per-visitor guest limit, #368 public /terms and /privacy, #369 checkout settlement module.

## Stages

- guards, no_regress, release_gate, settings_parity (pass; unused production settings listed for removal with the owner's OK), preflight, convex_deployed (adds index `checkoutSessions.by_buyerEmailNormalized`).
- web_deployed: the release script reported `fetch failed` while Vercel's build continued; the deployment completed and serves `0dc2cb85a` (`/version.json`).
- live verification: `release:verify` passed against the live SHA.

## Post-release

- [x] `starterProfile:backfillStarterProfilesInternal` run on production: all 118 accounts have a handle.
- [x] `https://www.polynet.ai/terms` renders Polynet Terms of Service v4 from build `0dc2cb85a`.
- [ ] Community sites are not on in production yet (Phase 3), so cash first is live only where sites are.
- [ ] Next release: drop `purchaseClaims`, the three claim stubs and the legacy claim fallback (C3).
