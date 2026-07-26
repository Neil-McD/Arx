# PC2B Final Requirement and Deletion Matrix — 2026-07-24

- Status: `COMPLETE`; closes PC2
- Scope: P01-P27 and M01, each exactly once
- Staging source: `9331f446b47285b1b14ddd6d04998e683f0184de`
- Branch: `codex/semantic-platform-staging-20260719`
- Upstream relation at execution: `0 ahead / 0 behind`
- Production documents or rows read: none
- Product code, schema, data, provider, deployment, and production changes:
  none

## 1. Decision rule

PC2 decides whether an outcome is required. It does not claim the staged
implementation is compatible or authorize deletion.

Unknown source, client, provider, and data truth is routed to PC3-PC5 rather
than represented as renewed product indecision. The allowed primary
compatibility classifications remain:

- `PORT BACKEND-FIRST`
- `EXPAND-MIGRATE-CONTRACT`
- `REWORK`
- `DROP`
- `ALREADY PRESENT`

No remaining job is `PORT AS-IS`.

## 2. Final matrix

| ID | MVP owner | Final requirement disposition | Primary classification | Production-data dependency | Protected-core / preservation constraint | Next proof |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | staging operations | Drop staging deployment machinery from production. | `DROP` | None. | Staging guards remain on the staging lane. | None |
| P02 | architecture governance | Keep only compact current contracts and receipts. | `REWORK` | None. | Do not port frozen snapshots or one-off audit machinery. | PC6 |
| P03 | privacy / account lifecycle | Keep zero-effect account-deletion quarantine until safe execution exists. | `PORT BACKEND-FIRST` | None for quarantine; later deletion has broad dependencies. | Shared community, DM, finance, provider, and intelligence state must survive. | PC3A |
| P04 | Builder Partner / finance | Keep secondary prospective 4% community-revenue-only outcome; preserve historical economics. | `REWORK` | Yes: historical commission, payout, terms, provider, and liability state. | Do not rewrite historical policy/rate basis. Sequence last. | PC3-PC6, last |
| P05 | auth / sessions | Keep subject-bound, hashed, expiring, recoverable session authority. | `EXPAND-MIGRATE-CONTRACT` | Yes: existing sessions and cached clients. | Auth/session lifecycle is MVP core and must fail closed. | PC3 then PC4 |
| P06 | membership / community access | Keep explicit active state, unique pairs, canonical counts, and owner authority. | `EXPAND-MIGRATE-CONTRACT` | Yes: memberships, counts, owner residues, subscriptions. | Do not manufacture owner access through membership rows. | PC3 then PC4 |
| P07 | entitlements | Keep one bounded account-tier and entitlement authority. | `EXPAND-MIGRATE-CONTRACT` | Yes: historical/current entitlement projections. | Absence remains Free; corruption fails closed. | PC3 then PC4 |
| P08 | join / funnel admission | Keep one join-request, gate, funnel, and auth-resume authority. | `EXPAND-MIGRATE-CONTRACT` | Yes: requests, memberships, cached clients, local resume state. | Published remains gated; one canonical funnel entry. | PC3, PC4, PC5 |
| P09 | privacy / community lifecycle | Keep zero-effect community-deletion quarantine until transfer, content, billing, and provider rules exist. | `PORT BACKEND-FIRST` | None for quarantine; later deletion has broad dependencies. | Community harness, compiler, resources, memory, and member state remain protected. | PC3A |
| P10 | billing / paid access | Keep verified-provider authority, idempotent checkout finalization, one subscription lifecycle, and builder payouts. | `EXPAND-MIGRATE-CONTRACT` | Yes: Stripe, subscriptions, memberships, claims, blocks, settlements. | Redirects remain UX only; provider/webhook truth is authoritative. | PC3, PC4, PC5 |
| P11 | release engineering | Keep dependency, CI, build, budget, canary, and fallback guarantees; reconcile their implementation with current `main`. | `REWORK` | None. | Do not replace current production workflows or multiply redundant gates. | PC3 then PC6 |
| P12 | analytics / operations | Delete superseded analytics APIs and user-identity projection; retain required aggregate reporting. | `EXPAND-MIGRATE-CONTRACT` | Yes: stored rows, public functions, cached consumers. | Anonymous analytics stays hash-only. | PC3 then PC4 |
| P13 | identity hygiene / operations | Delete the orphaned anonymous-user cleanup runtime if no live owner or backlog exists. | `DROP` | Yes: anonymous roots, schedules, external/operator callers. | No broad scan or inferred empty state. | PC3 then PC4 |
| P14 | privacy / account lifecycle | Keep quarantine and policy; park the unused generic request/preflight/receipt substrate. | `DROP` | None for the production port. | Do not build a generic lifecycle engine or reuse it for authored-content purge. | Separate staging cleanup proof only |
| P15 | resources / intelligence | Keep one canonical resource body and bounded metadata/read authority. | `EXPAND-MIGRATE-CONTRACT` | Yes: resource bodies, hashes, readers, rollback compatibility. | Community resources, memory, compiler, and harness are protected core. | PC3 then PC4 |
| P16 | interactions / community chat | Keep canonical interactions as the sole destination authority. | `EXPAND-MIGRATE-CONTRACT` | Yes: legacy messages, links, readers, writers, cached clients. | Preserve community harness, compiler, resources, memory, and thread continuity. | PC3, PC4, PC5 |
| P17 | retention email | Keep weekly digest return loop and short current excerpts; delete legacy readers and persisted content copies. | `REWORK` | Staging outbox contraction complete; production port remains separately gated. | The recipient sees useful canonical context while the queue and receipt retain no authored prose. | Staging cleanup complete |
| P18 | interactions / product | Delete the featured-message subsystem. | `DROP` | Yes: deployed production readers, fields, rows, and UX. | Do not remove an independently required production behavior without PC5 proof. | PC3, PC4, PC5 |
| P19 | interaction migration | Delete legacy reactions, mappings, and residue after zero-reader and data proof. | `DROP` | Yes: physical rows, aggregates, links, old clients. | Canonical reactions/interactions must remain correct. | PC3 then PC4 |
| P20 | attachments / storage | Keep canonical attachments; delete legacy fallback after exact blob and row convergence. | `EXPAND-MIGRATE-CONTRACT` | Yes: storage objects, attachment rows, legacy payloads. | Never lose user blobs or break rollback before contraction. | PC3 then PC4 |
| P21 | interaction identity | Keep canonical root/reply identity; delete legacy message/thread fallback after client compatibility. | `EXPAND-MIGRATE-CONTRACT` | Yes: mappings, callers, cached clients, rollback readers. | Preserve canonical interaction history and reply targets. | PC3 then PC4 |
| P22 | resources / intelligence | Delete dormant archive storage/runtime only if it is not an authority or protected dependency. | `DROP` | Yes: archive rows, deployed callers, protected-core relationships. | Community resources, compiler, memory, and harness cannot be collateral deletion. | PC3 then PC4 |
| P23 | intelligence data hygiene | Port no permanent malformed-trace cleanup code. | `DROP` | Yes only to decide whether a disposable production cleanup is needed. | Preserve valid evidence and compiler lineage. | PC4 |
| P24 | intelligence / compiler | Delete bulk historical cognition replay as a normal runtime requirement. | `DROP` | Possible historical work-state dependency; source proof first. | Evidence, compiler, memory, and harness remain protected. | PC3 |
| P25 | interaction migration | Delete legacy interaction backfill/bridge runtime after zero-writer, zero-reader, and backlog proof. | `DROP` | Yes: backfill state, mappings, deployed callers, cached clients. | Canonical interactions and evidence lineage must already be complete. | PC3 then PC4 |
| P26 | privacy / evidence | Keep the privacy outcome: remove retained raw retrieval-query text after operational need. | `EXPAND-MIGRATE-CONTRACT` | Yes: historical query fields and retention policy. | Preserve identity-only retrieval receipts and accepted intelligence. | PC3 then PC4 |
| P27 | security / evidence | Keep immediate fail-closed revocation across derived intelligence, digests, compiler handoff, and agent filesystem. | `PORT BACKEND-FIRST` | No migration required for containment; source compatibility must be proven. | Protected intelligence remains, but revoked evidence cannot be read. | PC3 |
| M01 | frontend product | Preserve current production CRIS theme, community events, chrome, and embed behavior. | `ALREADY PRESENT` | None. | Preservation constraint on every future candidate. | PC5 and every release unit |

## 3. Reduction result

| Result | Jobs |
| --- | --- |
| `PORT BACKEND-FIRST` | P03, P09, P27 |
| `EXPAND-MIGRATE-CONTRACT` | P05-P08, P10, P12, P15-P16, P20-P21, P26 |
| `REWORK` | P02, P04, P11, P17 |
| `DROP` | P01, P13-P14, P18-P19, P22-P25 |
| `ALREADY PRESENT` | M01 |

The matrix contains no `DECISION REQUIRED`, `BLOCKED`, or `PORT AS-IS`
classification. Missing evidence remains visible through its next proof phase.

## 4. Dependency order

```text
contain irreversible deletion risk
  -> protect revoked-evidence reads
  -> reconcile auth, membership, entitlement, admission, and money
  -> migrate canonical resources, interactions, and attachments
  -> contract legacy APIs, tables, bridges, archives, and replays
  -> reconcile user journeys and release units
  -> reconcile Builder Partner history last
```

This order does not authorize implementation or release.

## 5. PC2 acceptance

PC2 is complete because:

1. all 28 jobs are present exactly once;
2. every job has an MVP owner and final requirement disposition;
3. every job has one primary compatibility classification;
4. every deletion candidate names its proof gate;
5. protected-core and current-production constraints are explicit;
6. product decisions are no longer mixed with missing technical evidence;
7. no code, schema, data, query, provider, deployment, or production action
   occurred.

## 6. Next bounded slice

`PC3A` is a read-only destructive-lifecycle quarantine compatibility map for
P03 and P09.

It must compare current production and staging source for:

- public UI and gateway call paths;
- exact Convex function identities and validators;
- cached-client behavior;
- account and community deletion side effects;
- the minimum backend-first quarantine boundary;
- rollback and user-facing failure behavior;
- separation into independent account and community release units.

PC3A performs no data query, code change, integration, deployment, or deletion.

Subsequent checkpoint: PC3A is complete in
`pc3a-destructive-lifecycle-quarantine-compatibility-20260724.md`. It confirms
P03 and P09 as separate backend-first semantic rebuilds with stable public
contracts, zero-effect cached-client containment, and no safe rollback to the
old destructive executors. PC3B, the read-only P27 revoked-evidence
compatibility map, is next.

Subsequent checkpoint: PC3B is complete in
`pc3b-revoked-evidence-read-compatibility-20260724.md`. The requirement is
retained, its current source/API/schema basis is compatible, and its staging
implementation is classified `REWORK` rather than an as-is port. PC3C, the
read-only P05 auth/session compatibility map, is next.
