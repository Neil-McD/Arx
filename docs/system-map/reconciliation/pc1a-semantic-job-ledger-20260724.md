# PC1A Semantic-Job Ledger — 2026-07-24

- Status: `COMPLETE`; decisions remain preliminary until PC2 review
- Boundary: merge base `a936dee72a65f91723f332779390210e4cf783f0`,
  production `30248b6d2b1363943a700fbb673b3ad57866027b`, semantic staging
  `9331f446b47285b1b14ddd6d04998e683f0184de`
- Coverage: 119 of 119 staging-only commits and 3 of 3 production-only commits
- Production documents read: none
- Application functions invoked: none

## 1. Method

Commit numbers below are the deterministic order produced by:

```text
git log --reverse --format='%h %s' \
  a936dee72a65f91723f332779390210e4cf783f0..9331f446b47285b1b14ddd6d04998e683f0184de
```

The idiot index scores the challenged requirement, not the value of the cleanup
commit. A high score means the named requirement should probably be deleted.

`KEEP` means keep the outcome for compatibility analysis. It does not mean copy
the staged implementation or merge its commits.

## 2. Preliminary Ledger

| ID | Commits | Requirement being challenged | Owner and current truth | II | Preliminary result |
| --- | --- | --- | --- | ---: | --- |
| P01 | 1-2, 8, 12 | Production needs semantic-staging deploy scripts, project binding, and guards. | Staging operations only; package scripts consume them, product runtime does not. | 9 | `DROP` from production port; retain on the staging lane. |
| P02 | 5-7, 26, 68 | The full frozen inventory, audit-tool, and receipt corpus must ship with product changes. | Documentation only; runtime guards explicitly exclude the snapshots. | 9 | `REWORK`: keep canonical contracts and compact ledgers; do not port frozen snapshots or one-off audit machinery automatically. |
| P03 | 3-4, 13 | Direct destructive account deletion can remain callable before ownership, retention, and provider policy is complete. | Production still exposes web → gateway → `account:deleteOwnAccount`; staging quarantines it and removes the UI call path. | 10 | `KEEP` the quarantine outcome. |
| P04 | 9-11 | Builder Partner must be a primary launch gate or retain 5%/paid-tool economics. | User and MVP contracts retain it as secondary Settings/operator capability at prospective 4% community-only economics; historical obligations remain immutable. | 9 | `KEEP` the v3 outcome; sequence historical reconciliation last. |
| P05 | 14-25, 32-35 | Secure, subject-bound, recoverable auth/session continuity is optional. | Core MVP; active API routes, web controllers, Convex auth modules, and session records consume it. Production has the older distributed path. | 0 | `KEEP`; backend/session compatibility required. |
| P06 | 27-31 | Membership status, unique member/community pairs, canonical counts, and owner membership can remain distributed. | Core access authority; community, admin, billing, email, agent, and platform-home paths consume it. | 0 | `KEEP`; data compatibility required. |
| P07 | 36-38 | Account tier/entitlement resolution may remain duplicated across consumers. | Core billing/access authority; auth, gates, admin, billing, ontology, operator, and badge paths consume the staging core. | 0 | `KEEP`; backend-first candidate. |
| P08 | 39-50 | Platform-home admission, join requests, funnel intent, and post-auth continuation need multiple authorities. | Core founder/member funnel; web funnel and `communityPublic` actively consume the staged join/admission path. Production has older inline/duplicated logic. | 0 | `KEEP`; decompose into admission-compatible units. |
| P09 | 52 | Community deletion can remain directly callable before transfer, subscription, content, and provider ownership is defined. | Community management is core; destructive execution is not safe. Staging removes the direct UI path and quarantines backend deletion. | 10 | `KEEP` the quarantine outcome. |
| P10 | 51, 53-55, 63-66, 69-73 | Checkout, subscription events, access, recovery, cancellation, and purchase claims may retain competing authorities. | Core paid-access journey; active funnel, Stripe webhook, commerce, access, admin, and cancellation paths consume it. | 0 | `KEEP`; requires backend-first and expand/migrate/contract sequencing. |
| P11 | 56-62 | Dependency integrity, executable CI gates, exact-build canary, and search fallback parity are optional. | Release reliability/security only; no user UI. Current production also changed the overlapping workflow and proof files. | 1 | `REWORK`: keep the gates, reconcile with current `main`, and avoid staging-specific release assumptions. |
| P12 | 67, 79-80 | Superseded community analytics APIs and identity writes must remain. | Analytics reporting remains; the challenged APIs/identity projection have no retained staging consumer. Production still carries the older surface. | 9 | `KEEP` the deletion outcome, subject to API/data compatibility. |
| P13 | 75 | The orphaned anonymous-user cleanup runtime must remain. | Deployed module exists only in production; staging removed its source and has no consumer. | 8 | `KEEP` as a deletion candidate; prove production reachability/data first. |
| P14 | 74, 76-78, 118 | A generic account-lifecycle request/receipt/preflight substrate is MVP-ready before a public flow, policy authority, or executor exists. | Staging has two internal mutations and two new tables; exact function names have no first-party runtime caller outside their module/tests. | 7 | `DECISION REQUIRED`: preserve quarantine/policy evidence, but do not port or expand the substrate yet. |
| P15 | 81-84 | Resource metadata and full bodies should retain duplicate ownership and unbounded directory loading. | Protected core; web resources, compiler, digest, evidence, recent context, and memory projections consume canonical body hydration. | 0 | `KEEP`; data migration/rollback proof required. |
| P16 | 85-90 | Community chat needs both legacy chat authority and canonical interaction authority. | Core member loop; staging web, agent, evidence, mentions, and community APIs use canonical interactions. Production still exposes legacy chat/activity modules. | 10 | `KEEP` the canonicalization outcome; never contract before production migration proof. |
| P17 | 91-92 | Weekly community digest may remain coupled to legacy chat/featured state or be deleted. | Retention email remains useful for MVP; staging cron/digest reads canonical interactions. | 1 | `KEEP` the digest and its canonical reader migration. |
| P18 | 93-94 | A separate featured-message subsystem is required for MVP. | Not in MVP scope; production funnel/visitor code and deployed `communityFeatured.js` still consume it, staging does not. | 8 | `KEEP` the deletion outcome provisionally; PC2 must confirm no retained product promise. |
| P19 | 95-98 | Legacy reactions, mappings, and interaction residue need permanent runtime/schema ownership. | No staged live reader remains; production compatibility and physical rows are unproven. | 9 | `KEEP` the retirement outcome; PC4 data gate required. |
| P20 | 99-101 | Legacy attachment fallback must remain beside canonical interaction attachments. | Staging renderer and interaction writer use the canonical path; production retains the legacy module. | 9 | `KEEP` the cutover outcome; storage/data rollback proof required. |
| P21 | 102-103 | Live interactions must retain legacy message/thread identity fallback. | Staging active writes/reads use canonical root/reply identity; production still has bridge-era behavior. | 9 | `KEEP` the severance outcome; cached-client/API proof required. |
| P22 | 104-106 | Dormant community archive storage/runtime is an MVP authority. | Production deploys `communityArchiveDocuments.js`; staging removed it. Community compiler/resources are protected and must remain independent. | 8 | `KEEP` the deletion candidate only if protected-core and production-data gates pass. |
| P23 | 107-109 | A temporary malformed-trace drain must become permanent production code. | The temporary module is absent from both final staging and production source; production row state is unknown. | 10 | `DECISION REQUIRED`: port no final code; ask only whether bounded production cleanup is needed. |
| P24 | 110-111 | Bulk historical cognition replay is required for normal community intelligence. | Protected evidence/compiler paths remain; staging removes only bulk historical replay behavior. | 9 | `KEEP` the deletion outcome, with protected-core verification. |
| P25 | 112-113 | Legacy interaction backfill/bridge runtime must remain indefinitely. | Production still deploys `communityInteractionBackfill.js`; staging final runtime does not. | 10 | `KEEP` the retirement outcome; require zero legacy writers/readers and data proof. |
| P26 | 114-117 | Raw retrieval-query text must remain stored after operational need expires. | Privacy/security concern; staging performs a bounded scrub and removes storage. | 9 | `KEEP` the privacy outcome; production retention/data policy required. |
| P27 | 119 | Revoked source evidence may remain readable through derived intelligence, digests, or the community-agent filesystem. | Security invariant; staging agent filesystem, heartbeat, compiler, and intelligence readers consume the fail-closed helper. Production lacks it. | 10 | `KEEP`; high-priority backend read-boundary candidate. |
| M01 | production 1-3 | Staging may overwrite current CRIS theme, community-event, chrome, and embed behavior. | These are current production-only user-facing changes across 24 files. | 10 | `ALREADY PRESENT`; preserve explicitly in every candidate. |

## 3. Coverage and Decision Shape

All 119 staging commits are assigned exactly once:

- core/security outcomes retained for analysis: P03-P10, P15-P17, P27;
- legacy/deletion outcomes retained for proof: P12-P13, P18-P22, P24-P26;
- staging-only production-port drop: P01;
- reduced/rebuilt rather than ported wholesale: P02 and P11;
- explicit decisions still required: P14 and P23;
- production-only behavior to preserve: M01.

This ledger does not authorize any deletion or port.

## 4. Evidence Anchors

- PC0 source/runtime/table boundary:
  `pc0-current-truth-20260724.md`.
- Direct production account deletion path:
  `apps/web/src/App.tsx` → `shared/cloudAccountGateway.ts` →
  `convex/account.ts`.
- Staged lifecycle substrate isolation:
  `recordOwnAccountDeletionRequestInternal` and
  `evaluateOwnAccountDeletionPreflightInternal` have no first-party runtime
  caller outside their module/tests.
- Staged entitlement core consumers:
  `auth.ts`, `gates.ts`, `entitlements.ts`, `premiumBilling.ts`,
  `communityAdmin.ts`, `memberOntologyCore.ts`, `operatorIntelligence.ts`, and
  `premiumMemberBadge.ts`.
- Staged join core consumers:
  `communityPublic.ts`, `communityAdmin.ts`, `communityCore.ts`,
  `communityLifecycle.ts`, `communityMembershipLifecycle.ts`,
  `platformHomeCommunity.ts`, and `memberOntology.ts`.
- Staged resource-body consumers:
  resource APIs, compiler/digest, evidence, recent context, Wiki architect, and
  memory projection.
- Current production-only deployed modules include anonymous cleanup, featured
  messages, archive documents, interaction backfill, and legacy onboarding.

## 5. Next Decision Gate

PC2 should ratify only these questions before deeper compatibility work:

1. Keep P14 policy/quarantine work but park the request/receipt/preflight
   substrate until a real user/legal flow owns it?
2. Port no P01 staging machinery and reduce P02 to canonical contracts plus
   compact receipts?
3. Preserve P04 Builder Partner v3 as secondary and sequence its historical
   reconciliation last?
4. Preserve P17 weekly digest while deleting its legacy readers?
5. Treat P23 as a production-data question with no permanent code to port?
6. Preserve all M01 current-production UI behavior?

No production row query is justified until those decisions are ratified.

## 6. Subsequent production evolution checkpoint

PC3D observed two additional production commits after PC3C:
`143828bc` and `456ebb9c`. They change only the DM composer CSS and three
composer/DM proof scripts. Both extend M01's current-production preservation
constraint and do not alter any P06 membership/access source, schema, API, or
migration contract. Production-only divergence is now eight commits; the
historical PC1A assignment above remains unchanged.
