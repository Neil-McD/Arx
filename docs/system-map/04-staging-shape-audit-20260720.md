# 04 — Read-only Staging Shape Audit — 2026-07-20 UTC

## Boundary and method

| Concern | Evidence |
| --- | --- |
| Worktree/branch | isolated `semantic-platform-staging-20260719` / `codex/semantic-platform-staging-20260719` |
| Source `HEAD` and staging upstream | `67c89903add41ff9b8de20929e07429a8d98f3bc`, exact match |
| Production Git authority | `origin/main` at `a936dee72a65f91723f332779390210e4cf783f0`, recorded separately and never queried |
| Convex data deployment | explicit `quick-porcupine-949` staging selector |
| Guard | staging identity guard and its rejection proof passed immediately before audit |
| Time | `2026-07-20T03:37:37Z` through `2026-07-20T03:39:42Z` |
| Mechanism | Convex `--inline-query`; readonly sandbox with no database write or network/provider capability |
| Output policy | aggregate counts/state labels only; no IDs, names, email values, content, URLs, tokens, secrets, or raw records |

Queries are preserved under [`tools/staging-audit/`](tools/staging-audit/). No `--push`, mutation, action, cron, provider call, email, payout, deployment, production selector, or environment change occurred.

The first identity query read 14.46 MB and Convex warned it was near the 16 MB execution limit because `authSessions` exceeded the 5,000-row cap. The remaining query caps were reduced before execution. A truncated scan establishes a lower bound only; its state/age distribution is not a whole-table distribution.

## Identity and access

| Evidence | Staging result | Conclusion |
| --- | ---: | --- |
| users | 120, complete | small staging population |
| anonymous subjects | 56 | anonymous cleanup is not dead; creator/reference ownership remains unknown |
| non-anonymous subjects | 64 | — |
| rows with email | 4 | most staging accounts are not email-shaped |
| email-bearing rows missing normalized email | 1 | the compatibility backlog relevant to indexed email lookup is one observed row, not 117 |
| rows with neither email nor normalized email | 116 | explains most missing-normalized rows; do not infer 116 full-scan candidates |
| duplicate auth subjects / normalized emails | 0 / 0 | uniqueness holds in complete staging scan, not schema-enforced globally |
| auth sessions | more than 5,000 | full-table prune risk is already material |
| bounded 5,000-session prefix | 4,718 revoked, 282 active, 4,715 replacement rows | session history/replacement residue dominates the bounded prefix; total is unknown |
| entitlement rows | 91 across 78 users | two users have multiple rows; maximum is 13 |
| ambiguous latest entitlement timestamps | 0 | no live staging tie conflict |
| communities | 44 | 2 Published, 42 Unlisted; 20 approval, 8 open, 16 paid |
| duplicate slugs | 0 | complete staging scan |
| memberships | 69 | all explicit active `free_grant` member rows; no inactive/revoked rows |
| duplicate membership pairs / multiple-active pairs | 0 / 0 | duplicate compatibility is latent, not present in this staging snapshot |
| membership rows missing `active` | 0 | staging data no longer requires the missing-active fail-open rule |
| active owner membership rows | 2 | owner-as-membership legacy residue exists despite canonical owner separation |
| `activeMemberCount` | missing on 35 of 44 communities | 35 rows undercount canonical minimum by one; 9 match exactly |
| join requests | 1, status `approved` | no unexpected workflow vocabulary observed |
| deprecated `memberOnboarding` | 0 rows | staging data is ready for a later schema-removal proof |

The initial member-count aggregate reported 37 mismatches because it included two owner-membership residues. The targeted follow-up applied the canonical rule that owners do not count as membership rows: the corrected result is 35 missing cached values and two separate owner-membership residues.

## Interaction, privacy, and content migrations

All scans in this section were complete below the 1,000-row caps.

| Evidence | Staging result | Conclusion |
| --- | ---: | --- |
| legacy chat threads/messages/links | 4 / 67 / 67 | migration residue is fully live, not hypothetical |
| legacy link kinds | 51 roots, 16 replies | every sampled legacy message has a link |
| canonical interactions | 54 roots, 23 replies | canonical system contains additional objects beyond linked legacy rows |
| canonical attachments | 0 | attachment backfill is currently empty in staging |
| moderation events | 1 edit, 5 hide, 2 tombstone | normal moderation lifecycle is active |
| privacy purge requested/completed | 0 / 0 | schema states have no observed operational use |
| DMs | 4 conversations, 8 active participants, 7 messages | every conversation has at least two participants |
| resources/content rows | 10 / 8 | intended content table is mostly adopted |
| inline resource bodies | 2 | both lack a content row; migration is a clean 2-row remaining partition |
| duplicate/orphan content rows | 0 / 0 | no content-row integrity defect observed |
| evidence retrieval receipts | 0 | no migration state |
| intelligence retrieval receipts | 7 | 5 still contain legacy raw query text |
| intelligence nodes | 5 | 1 is `legacy_unversioned` by current citation rule |

The DM account-deletion defect has real blast radius in staging: all four conversations are shared. This audit did not invoke deletion or inspect message content.

## Account-lifecycle state outside the current delete path

Non-zero staging state exists in several table classes not explicitly handled by `deleteOwnAccount`: 46 legal acceptances, one member fact, one profile spine, 10 Stripe customer rows, one workspace directory snapshot, 96 worker-capacity leases, and 125 Daytona runtime targets. Zero rows were observed for app OAuth state, source-integration auth/connections, auto-recharge settings, and file-preview snapshots.

These counts do not mean every row should be deleted. They prove that a field-level retention/ownership matrix is necessary before declaring account deletion complete.

## Finance and Builder Partner economy

All scans were complete below the 2,000-row caps.

| Evidence | Staging result | Conclusion |
| --- | ---: | --- |
| Builder Partners | 16 active | retained secondary system has active state requiring prospective migration |
| bound/eligible attributions | 16 / 16 | referral relationships are active |
| partner terms on partner rows | all 16 are `builder_partner_terms_v1` | all are stale relative to current source-required v2 |
| standalone matching legal receipts | 2 of 16 | acceptance lineage is incomplete for the legacy rows |
| commission ledger | 15 payable rows, aggregate $90 | retained financial obligations/history exist |
| payout batches | 11 pending approval, aggregate $72 | manual/operator decision surface exists |
| payout transfers/items | 12 pending / 12 reserved, aggregate $72 | deletion or cron removal would strand staged payout state |
| adjustments/debt | 0 / 0 | no dispute/refund adjustment state observed |
| Connect accounts | 34 ready; no duplicate user rows | payout-provider projection is populated |
| community subscriptions | 0 | no active subscription projection in this staging snapshot |
| checkout sessions | 19: 17 complete, 2 pending | 16 community join and 3 premium sessions |
| credit/customer duplicates | 0 / 0 | sampled uniqueness holds |
| legal acceptances | 22 Terms, 22 Privacy, 2 Builder Partner | 46 total |

Source reconciliation sharpens the terms result:

- new commission attribution requires an active partner **and current v2 terms**, so the v1 rows should not create new commissions through that path;
- payout planning/validation checks active partner and financial readiness, not current-term acceptance, so existing pending batches may remain actionable if an operator approves them.

The later product decision retains Builder Partner under prospective v3 economics. These rows therefore require mixed-policy reconciliation: preserve old obligations and their evidence, require new acceptance for new economics, and do not delete or blindly reinterpret pending state.

## Async capacity and retention

Current staging is below the static starvation thresholds:

- 44 communities, so none is beyond the 500-community memory-sweep prefix;
- 2 Published and 42 Unlisted communities, both below the 50-per-visibility digest prefix;
- one community with AI-feed rows, below the 2,000-community monthly-prune ceiling;
- no events and no community above 500 active membership rows; maximum is 62.

Therefore the no-cursor algorithms remain confirmed scalability defects but do not currently strand staging objects.

Operational tables already show retention pressure: 257 critical audit events, 791 runtime runs, 851 memory-metabolizer runs, more than 2,000 diagnostic events, and more than 2,000 runtime events. The capped event scans sampled the oldest prefix and must not be interpreted as full age distributions. Email outbox contained 128 suppressed and one failed row; no pending email job was observed.

## Candidate status changes

| Candidate | Before | After this audit |
| --- | --- | --- |
| missing membership `active` compatibility | prevalence unknown | zero rows in complete staging scan; eligible for a guarded removal slice |
| duplicate memberships | prevalence unknown | zero pairs before and after the staging-verified fail-closed pair-authority cutover |
| deprecated `memberOnboarding` | prevalence unknown | zero rows; strongest schema deletion candidate |
| auth email full-scan compatibility | unknown backlog | one email-bearing row lacks normalization; the later subject-authority slice deleted relink compatibility without requiring a data migration |
| revoked-session prune | theoretical scale concern | table exceeds 5,000 and bounded prefix is 94% revoked; operationally material |
| anonymous cleanup | possibly dead | 56 anonymous accounts; do not delete cleanup until creation/reference lifecycle is understood |
| account deletion shared-data risk | source-only | all four DMs are shared; real staging blast radius confirmed |
| legacy interactions | unknown prevalence | 67 messages/links; migration required |
| inline resource body | unknown prevalence | exactly 2 of 10 resources; bounded migration required |
| raw retrieval queries | unknown prevalence | 5 of 7 intelligence receipts; privacy migration required |
| Builder Partner system | doctrine contradiction | retained as secondary; active financial/payout state and stale terms require prospective v3 migration |
| cron starvation | source defect | latent at current 44-community scale, not current staging impact |
| audit/runtime retention | policy unknown | diagnostic/runtime event tables both exceed 2,000-row audit cap |

## Read-only gate result

Pass. The audit resolved data-shape uncertainty without exposing private content or changing state. It does **not** authorize migration, deletion, payout handling, cron changes, account deletion, or production inference. The later decision record resolves Builder Partner direction and shared-data ownership for planning. The next safe step is an isolated two-user account-deletion behavioral proof and fail-closed boundary—not a live mutation.

## Membership cutover revalidation — 2026-07-21 UTC

Immediately before the explicit-active schema cutover, the same versioned read-only query was rerun against `quick-porcupine-949`. The complete result remained 69 membership rows, zero missing `active` values, zero duplicate pairs, zero multiple-active pairs, and zero inactive/revoked rows. The identical aggregate was returned after the required schema and fail-closed projections deployed successfully. No identifiers or content were returned and neither audit changed product state. This receipt authorized removal of the missing-active compatibility rule and its temporary repair mutation; it did not authorize the separate membership-uniqueness or active-member-count migrations.

## Membership-pair authority cutover — 2026-07-21 UTC

Before the pair-authority cutover, the versioned read-only identity/access query again scanned the complete staging membership table at `quick-porcupine-949`: 69 rows, zero duplicate pairs, zero multiple-active pairs, zero missing `active`, and zero inactive/revoked rows. The cutover replaces order-dependent duplicate selection with one indexed unique-pair resolver, preserves one activation/reactivation row, and makes duplicate input fail closed. Convex serializable mutation retries provide the concurrency boundary because the indexed pair read and possible insert remain in one mutation transaction. The identical complete aggregate was returned immediately after the exact clean changeset deployed to Dev Convex; neither query changed data or exposed identifiers/content. This closes duplicate-selection compatibility on staging. Active-member-count repair and owner-membership residue remain separate work.

## Auth-session cutover receipt — later authorized slice

This section records a later implementation slice and does not retroactively change the read-only boundary above.

- The exact staging guard passed before every deployment and migration invocation; production was never selected or queried.
- The replacement ledger was drained through capped 500-row reads and isolated one-row writes. Controlled output in the final drain alone processed more than 60,000 rows, with active credentials preserved as hashes and terminal/replacement residue deleted.
- The final migration batch processed 331 rows and returned `done=true`, with no skipped or retryable rows.
- A separate indexed query then returned `legacy_rows_exist: false`; the bounded first 500 hashed rows had zero replacement pointers and zero missing/expired absolute lifetimes.
- Only after that zero-state receipt were the legacy raw-credential fields/indexes and the temporary migration/public-maintenance surfaces removed from source.

The original “more than 5,000” result was therefore a lower bound on severe replacement amplification, not a near-total. The canonical design now prevents that growth by holding one bounded row per sign-in and refreshing encrypted provider state in place.
