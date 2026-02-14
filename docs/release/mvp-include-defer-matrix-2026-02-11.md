# MVP Include / Defer Matrix (Current Direction)

Date: 2026-02-12  
Scope: `.worktrees/mvp`

This file is the working MVP contract for surface-area reduction.

## Include (ship in MVP)

1. Auth and session lifecycle.
2. Community creation and management.
3. Community visibility model simplified to `published` and `unlisted`.
4. Discover page retained under simplified visibility semantics.
5. Gated access model for published communities (discoverable, access-controlled).
6. Public community landing page at `/c/{slug}` for creator distribution (YouTube/social links) with join/request access CTA.
7. Core member experience: join, navigate, post/chat, and voice UX.
8. Billing and provider/account connections.
9. Existing community payout flow for builders.
10. Ongoing `App.tsx` decomposition to stabilize launch paths.

## Defer (post-MVP)

1. Affiliate program as a launch requirement.
2. Automated affiliate payouts.
3. Advanced automations/workflow depth beyond alpha essentials.
4. Funnel builder/editor complexity (AI schema generation, deep authoring controls).
5. Duplicate/legacy UI surfaces not needed by MVP journeys.
6. Extra inference-gating complexity beyond minimal tier limits.
7. Non-essential platform expansion outside creator setup + member participation loop.

## Immediate execution order

1. Disable deferred surfaces behind explicit flags, keeping routes/data contracts stable.
2. Keep public landing + join flow active while removing advanced funnel UI and affiliate UI.
3. Enforce `published`/`unlisted` semantics consistently in UI, routing, and edge handlers.
4. Continue `App.tsx` decomposition slices only where they reduce coupling on MVP-critical flows.
5. Delete dead code and stale docs once all callers are removed and checks are green.

## Release checks

1. `npm run -s build`
2. `bash ./scripts/thread_context_regression_check.sh`
3. `bash ./scripts/cloud_lens_provenance_regression_check.sh`
4. `bash ./scripts/community_core_check.sh`
