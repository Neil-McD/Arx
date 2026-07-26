# PC0 Current-Truth Receipt — 2026-07-24

- Status: `COMPLETE`
- Snapshot time: `2026-07-24T04:39:16Z`
- Scope: read-only Git, deployment-marker, Convex metadata, and source-surface
  reconciliation
- Production data documents read: none
- Application functions invoked: none
- Product, runtime, provider, data, and Git-ref state changed: none
- Existing worktree content changed: audit documentation only in semantic
  staging

## 1. Result

The comparison boundary is now exact and reproducible.

Production web matches current remote `main`. Semantic staging web matches the
remote semantic-staging branch. The branches share merge base `a936dee...`;
production has 3 unique commits and semantic staging has 119.

The long-lived staging branch is therefore evidence, not a merge candidate.
Its retained outcomes must be classified by semantic job and reconstructed as
small production-compatible units from current `origin/main`.

## 2. Isolation and Preservation

Remote Git comparison ran in a disposable clone:

`/private/tmp/polynet-compat-audit.3QdeWU`

That clone contains clean detached views of both observed endpoints:

| View | Commit | Status |
| --- | --- | --- |
| production source | `30248b6d2b1363943a700fbb673b3ad57866027b` | clean detached view |
| semantic staging source | `9331f446b47285b1b14ddd6d04998e683f0184de` | clean detached view |

No fetch, checkout, ref movement, merge, rebase, stash, or cleanup occurred in
the existing Polynet repository or its existing worktrees.

Preservation snapshot:

| Local surface | Observed truth |
| --- | --- |
| root checkout | `codex/mobile-interaction-correctness-20260713` at `82d2ceaac527bca736a7c1cec9c1bfd922a28a13`; 95 status entries; untouched |
| semantic staging checkout | `codex/semantic-platform-staging-20260719` at `9331f446b47285b1b14ddd6d04998e683f0184de`; only this planning/audit documentation is uncommitted |
| local `main` | `e3386dea6e2b5329f52c2a79a0a48ebb50bc5934`; stale and untouched |
| local `origin/main` tracking ref | `5b46ca5dd3ee86ad5445b35b9627c3c1f072ae4c`; stale and untouched |
| shared worktree registry | 105 entries, including 42 prunable historical entries; recorded as cleanup debt only |

Prunable worktree metadata is not evidence that its branches or underlying
commits are safe to delete.

## 3. Git and Web Deployment Identity

| Authority | Exact value |
| --- | --- |
| remote `origin/main` | `30248b6d2b1363943a700fbb673b3ad57866027b` |
| production `version.json` build | `30248b6d2b1363943a700fbb673b3ad57866027b` |
| remote semantic staging branch | `9331f446b47285b1b14ddd6d04998e683f0184de` |
| staging `version.json` build | `9331f446b47285b1b14ddd6d04998e683f0184de` |
| merge base | `a936dee72a65f91723f332779390210e4cf783f0` |
| production-only commits | 3 |
| staging-only commits | 119 |

The staging marker reports `environment: "production"`. That field cannot by
itself identify the Polynet production product: the checked-in Vercel binding is
project `polynet-staging`, and its build matches the semantic-staging branch.

The three production-only commits are:

1. `dbcd080` — Add CRIS theme and refine community chrome.
2. `5b46ca5` — Canonicalize community events and chat accents.
3. `30248b6` — Make chat embeds theme-aware.

They change 24 files with 1,742 additions and 606 deletions. Seven of those
paths are also changed by semantic staging:

- `.github/workflows/mvp-guards.yml`
- `apps/web/src/App.tsx`
- `apps/web/src/base.css`
- `package.json`
- `scripts/community_interaction_projection_ui_contract_proof.ts`
- `scripts/community_mention_rendering_contract_proof.ts`
- `scripts/member_agent_dock_contract_proof.ts`

File overlap understates semantic conflict. Current production theme, event,
embed, and chrome behavior must be retained explicitly when rebuilding any
staging outcome.

## 4. Staging Change Shape

Relative to the merge base, semantic staging changes:

- 328 files;
- 96 additions, 204 modifications, 27 deletions, and 1 rename;
- 96,647 added lines and 18,188 deleted lines.

Two frozen system-map snapshot files account for 69,028 of the added lines.
Raw line count is therefore a poor complexity measure.

Runtime/source concentration:

| Area | Files | Added | Deleted |
| --- | ---: | ---: | ---: |
| `convex/` | 99 | 14,355 | 8,149 |
| `scripts/` | 73 | 2,928 | 3,204 |
| `apps/` | 46 | 1,606 | 3,314 |
| `shared/` | 33 | 582 | 2,757 |
| `api/` | 7 | 164 | 79 |

Preliminary semantic buckets, not compatibility decisions:

1. staging/release boundary and system-map evidence;
2. Builder Partner economics;
3. auth identity, session continuity, logout, retention, and provider deadlines;
4. membership, ownership, entitlements, join requests, funnel admission, and
   checkout entry;
5. Stripe subscription authority, commerce events, cancellation, recovery, and
   paid access;
6. dependency security, CI, and exact-build canaries;
7. account and community lifecycle quarantine/preflight;
8. canonical resource bodies and bounded resource loading;
9. canonical interactions, chat, digest, featured content, attachments, legacy
   identity, archive, migration runtime, and retrieval privacy;
10. derived-evidence revocation containment.

PC1/PC2 must challenge these jobs individually. Commit presence does not prove
that an outcome remains required.

## 5. Source Schema and API Surface

Current production source defines 125 Convex tables. Semantic staging source
defines 124.

Source-schema tables only on production:

- `agentLifecycleActivations`
- `communityArchiveDocuments`
- `communityFeaturedMessages`
- `communityMessageReactions`
- `purchaseClaims`

Source-schema tables only on staging:

- `accountLifecycleReceipts`
- `accountLifecycleRequests`
- `communityCommerceEventEffects`
- `communitySubscriptionAccessBlocks`

Generated Convex API modules only on production source:

- `anonymousUserCleanup`
- `communityActivity`
- `communityArchiveDocuments`
- `communityFeatured`
- `communityInteractionBackfill`
- `communityInteractionLegacyAttachments`
- `communityInteractionLegacyBridge`
- `legacyOnboardingMigration`

Generated Convex API modules only on staging source:

- `accountEntitlementCore`
- `accountLifecycle`
- `accountLifecyclePolicy`
- `authProviderRequest`
- `authSessionCore`
- `communityCheckoutStartCore`
- `communityJoinRequestCore`
- `communitySubscriptionAccessCore`
- `communitySubscriptionCancellationCore`
- `communitySubscriptionEventConvergenceCore`

Semantic staging also adds two hourly scheduled calls:

- prune terminal auth sessions;
- prune community commerce event receipts.

These are compatibility boundaries, not automatic keep or delete decisions.

## 6. Deployed Convex Metadata

Read-only `convex function-spec` metadata resolved the configured environments:

| Runtime | URL | Functions | Function modules |
| --- | --- | ---: | ---: |
| production | `https://wry-hawk-715.convex.cloud` | 1,055 | 113 |
| staging | `https://quick-porcupine-949.convex.cloud` | 1,015 | 109 |

There are 58 deployed function identifiers only on production and 18 only on
staging.

Deployed function modules only on production:

- `anonymousUserCleanup.js`
- `communityActivity.js`
- `communityFeatured.js`
- `communityInteractionBackfill.js`
- `legacyOnboardingMigration.js`

Deployed function modules only on staging:

- `accountLifecycle.js`

This metadata proves the named deployed function surface. It does not prove
schema compatibility, row compatibility, behavior, or lack of external
consumers.

## 7. Physical Table-Name Metadata

Read-only `convex data` calls listed table names only. No documents were read.

| Runtime | Physical table names |
| --- | ---: |
| production | 136 |
| staging | 155 |

Physical table names only on production:

- `communityArchiveDocuments`
- `communityFeaturedMessages`
- `communityMessageReactions`
- `purchaseClaims`

Physical table names only on staging:

- `accountLifecycleReceipts`
- `accountLifecycleRequests`
- `accountSetupEvents`
- `billingRiskAdjustments`
- `communityAgentClaims`
- `communityAgentDrafts`
- `communityAgentToolCalls`
- `communityAiFeedItems`
- `communityAiFeedSignals`
- `communityCognitionSchedulerCursors`
- `communityCommerceEventEffects`
- `communityIntelligenceProposals`
- `communityInvites`
- `communityLandingVisitors`
- `communityMemoryCandidates`
- `communityPlans`
- `communitySubscriptionAccessBlocks`
- `premiumToolsAllowanceCycles`
- `premiumToolsAllowanceEntries`
- `premiumToolsRevenueReceipts`
- `premiumToolsSubscriptions`
- `threadHandoffSummaries`
- `userModelSettings`

Production lists 11 physical table names that are absent from current production
source schema. Staging lists 31 absent from current staging source schema. Both
source schemas have zero declared tables missing from their respective physical
table-name listings.

Convex can retain a physical table name after its schema declaration is gone.
The listings do not prove that any such table contains rows. They are
production-data questions for retained, data-sensitive slices in PC4—not
deletion authorization.

## 8. Reliability Boundary

Confirmed:

- exact remote source endpoints;
- exact web build-marker alignment;
- exact merge base and two-sided commit counts;
- clean disposable endpoint views;
- preservation of existing worktrees and refs;
- configured production and staging Convex deployment identities;
- deployed function metadata and physical table names;
- source-level schema, generated API-module, cron, and path deltas.

Not yet proven:

- row counts or row compatibility;
- external/cached-client use of changed functions;
- live provider truth;
- journey compatibility;
- rollback compatibility;
- whether each staged outcome is still required.

No conclusion may cross one of those boundaries by inference.

## 9. Next Slice

Run one combined cheap triage slice:

> Build the semantic-job ledger from the exact 119/3-commit boundary and fill
> only requirement owner, current first-party consumer, production equivalent,
> idiot index, and preliminary `KEEP`, `DROP`, `ALREADY PRESENT`, `REWORK`, or
> `DECISION REQUIRED`.

Do not perform production row queries or deep compatibility engineering until
that pass removes unnecessary work.
