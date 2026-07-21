# Dependency-Ordered Reduction Roadmap

This is a plan, not authorization. Every implementation slice gets its own clean diff, staging proof, rollback boundary, and explicit approval. Protected core is never deleted without human confirmation.

## Current position after the read-only audit

The aggregate staging shape work in Step 0 is complete for identity/membership compatibility, legacy interactions/resources/retrieval, Builder Partner state, anonymous users, scheduler thresholds, and selected retention tables. The two blocking product decisions are also recorded: Builder Partner is retained as a secondary capability under a prospective community-only 4% model, and account deletion must preserve/anonymize shared state while deleting private state. Exact retention periods and several unrelated architecture decisions remain open, but they do not block the first isolated safety fixture.

## Current implementation checkpoint

The account-deletion safety fixture, declarative lifecycle ownership policy, Builder Partner v3 economics, removal of the unreachable legacy deletion executor, first static deletion slice, explicit-active membership cutover, unique membership-pair authority cutover, required active-member-count cutover, and owner-membership authority cutover are complete on the isolated staging lane. F-001 and the core authenticated session-continuity slice are also closed: verified `authSubject` is the sole actor-binding authority; each sign-in creates one hashed, absolutely expiring server credential; refresh is an in-place single-owner state transition; logout is local-authoritative; terminal retention is indexed, bounded, internal, and scheduled; malformed session/flow cookies clear deterministically before bridge work; and one 10-second Convex-to-provider deadline spans headers plus body for PKCE and refresh. Outer browser/Vercel/Convex deadlines and bounded routine-success diagnostics remain contained hardening slices. The staging replacement ledger, missing-active membership backlog, duplicate membership-pair backlog, 35-row member-count cache backlog, and two unreferenced owner-membership residues were closed before their compatibility/migration surfaces were deleted. The quarantined deletion lifecycle remains downstream of entitlement-authority closure.

## Step 0 — Freeze decisions and gather minimum live shape

No product write.

1. **Resolved:** retain Builder Partner as a secondary capability; remove paid-tool commission eligibility; move new eligible community-revenue commissions prospectively from 5% to 4%; preserve previously earned ledger economics.
2. Decide that protected Workspace/harness means capability substrate, and separately name any user-facing Workspace destination that remains required.
3. **Resolved at the ownership level:** hard-delete private state, anonymize shared state, preserve minimum financial/legal evidence, and propagate explicit privacy purges through derived intelligence. Exact TTLs remain for finance/legal/security owners.
4. **Complete:** run bounded redacted staging aggregates for identity, membership, entitlement, legacy interactions/resource bodies, Builder Partner liabilities, anonymous users, and retention-state prevalence.
5. Record external official-MCP consumers and supported callable Convex names before transport retirement.

Gate: no ambiguous system is called dead and no financial/shared record is removed.

## Step 1 — Contain irreversible lifecycle risk

Smallest first implementation slice.

1. Add the smallest two-user behavioral fixture proving what the current account-deletion mutation does to a shared DM and community-owned content.
2. Add a narrow fail-closed guard that prevents the known destructive path when shared state is present; do not redesign or migrate live data in this slice.

Exit proof: the destructive behavior is reproduced by a synthetic fixture and can no longer run fail-open when shared state is present. No staging record is deleted or migrated.

## Step 2 — Migrate Builder Partner to v3 economics

1. Preserve community subscription and ordinary creator payout.
2. Implement a prospective Builder Partner v3 policy: community revenue only, 4% instead of 5%, no paid-tool commission, no retroactive ledger rewrite, and an explicit policy version/rate basis on every new commission.
3. Keep the ledger, attribution, risk hold, payout buffer, approval, adjustment, clawback, and payout machinery; reconcile all pre-v3 obligations under their original policy and legal evidence.
4. Require revised terms for new v3 accrual without treating old terms as consent to new economics.
5. Keep Builder Partner secondary in the coherent Settings/operator controls, stop expanding it through primary flows, and inventory Workspace/onboarding/headline coupling for removal in Step 8.
6. Separate premium, community commerce, workspace credits, and Builder Partner code/receipts conceptually and in tests.
7. Exercise delayed/reordered/refund/dispute/Connect and mixed-policy retry fixtures.

Exit proof: each new partner dollar has one policy version, rate basis, authority, idempotency key, and reconciliation owner; pre-v3 obligations remain unchanged and payable only under their original evidence.

## Step 3 — Rebuild destructive lifecycle safely

1. Turn the accepted ownership model into a declarative field/table lifecycle policy.
2. Expand the fixture to canonical evidence, storage objects, provider credentials, finance/legal/audit state, and interrupted deletion.
3. Replace one-transaction deletion with request/tombstone, write freeze, bounded cursor phases, external revoke, privacy scrub/retention tombstone, invariant audit, terminal receipt, root deletion last.
4. Implement participant-leave/shared-history semantics and canonical interaction privacy transitions.
5. Ensure storage and external-provider cleanup are idempotent and receipted.

Exit proof: interruption at every phase resumes safely; other-party/community state survives according to policy; no unauthorized content reappears through evidence/search/archive.

## Step 4 — Close identity and access invariants

1. **Complete on staging:** remove insecure credential fallback; store only the hash; prove generation and collision failure close before persistence.
2. **Complete on staging:** make refresh a stable one-row leased transition, make logout local-authoritative and recoverable, impose absolute expiry, and internalize indexed bounded retention.
3. **Complete on staging:** make verified `authSubject` the sole account-binding authority; remove the full-user email scan and inactive relink/continuity compatibility without migrating profile data.
4. **Membership authority complete on staging:** missing active state denies access; pair reads fail closed on duplicates; activation/reactivation preserves one row under Convex transaction retries; owner access comes only from `communities.ownerId`; every membership writer rejects owner rows; the two unreferenced owner residues are deleted; the member-count cache is reconciled for all 44 communities and schema-required; all temporary migration surfaces are deleted.
5. Tighten join-request state vocabulary.
6. Consolidate entitlement resolution into one bounded deterministic owner.

Exit proof: verified actor, membership, block, subscription, and tier invariants hold under duplicates, stale clients, concurrency, and provider delay.

## Step 5 — Guarantee eventual service and real CI

1. Add durable cursor/partition state for memory sweep, AI prune, digests, and recurring reminders.
2. Prove fairness above each current cap and across restarts.
3. Add web dependency install, typecheck, production build, artifact/bundle budget, and one vertical browser journey to canonical CI.
4. Classify 247 checks by unique invariant and CI/release/dev owner; merge/delete redundant lexical proofs only after stronger behavioral proof exists.
5. Define audit/diagnostic/runtime receipt retention and bounded operator queries.

Exit proof: every eligible object eventually receives service, and the canonical gate defends the actual shipped app.

## Step 6 — Finish canonical data migrations

1. Canonical interactions: backfill attachments/links, migrate archive/context/digest/cleanup reads, disable legacy writes, observe zero, remove backfill/link/chat residue.
2. Resource contents: normalize every reader, cursor-migrate inline bodies, observe zero, disable inline writes, remove compactor/fields.
3. Intelligence: scrub/remove raw legacy query fields and migrate `legacy_unversioned` evidence after retention/citation proof.
4. Re-run account/community deletion and evidence/privacy fixtures against the single authorities.

Exit proof: one canonical owner per content concern and zero compatibility reads/writes for an observation window.

## Step 7 — Collapse transport and capability duplication

1. Define one semantic capability kernel: identity/version/schema/authority/effect/idempotency/executor/receipt.
2. Generate/project native platform, community-agent, official MCP, worker, and UI subsets without flattening their distinct principals.
3. Remove `communityExperience.ts` after external compatibility proof.
4. Select one supported public Convex identity per operation; internalize source modules where feasible.
5. Version/deprecate legacy `workspace_*` MCP wire names; retain adapters for the promised window.
6. Factor shared OAuth credential/state/revocation primitives while keeping provider-specific semantics.

Exit proof: adapter parity is generated/tested and every operation reaches one authority/executor/receipt owner.

## Step 8 — Delete deferred product surfaces and configuration drift

1. Close the Workspace destination decision; remove route builders/controllers/host paths that are not protected substrate.
2. Remove Builder Partner Workspace/onboarding/headline UI after Step 2; retain the minimum coherent Settings/operator enrollment, terms, status, and payout controls.
3. Remove Discover Apps/Skills marketplace CSS and unused projections after build/screenshot proof.
4. Correct product docs and status indexes.
5. remove stale env quickstart/no-op flags and align model/workspace variable names with deployment configuration.
6. Decide package/lock/Node ownership and consolidate or document isolation.

Exit proof: every retained UI/config/doc surface maps to a retained MVP journey or protected capability.

## Step 9 — Decompose and optimize what remains

1. Re-measure `App.tsx`, CSS, backend hotspots, bundle, query counts, context/token sizes, and storage growth.
2. Extract domain hosts/controllers around the now-stable route and authority model.
3. Replace operator N+1 reads with indexed/materialized bounded projections.
4. Scope styles/tokens and remove residual lexical dead candidates with visual coverage.
5. Optimize compiler/retrieval/runtime only from measured bottlenecks.

Exit proof: smaller retained surface, lower change fan-out, bounded costs, and no new competing authority.

## Step 10 — Recovery, acceleration, and automation

1. Define product-data RPO/RTO and perform isolated backup/restore and provider-outage drills.
2. Automate release evidence, migration zero-observation, fairness SLOs, orphan audits, dependency policy, and privacy lifecycle receipts.
3. Accelerate only after deletion and invariant closure; automation must not perpetuate compatibility or deferred obligations.

## Historical first implementation recommendation

The first implementation slice should be the smallest isolated account-deletion safety proof: create two synthetic users with a shared DM and community-owned contribution, characterize the current mutation, and add a fail-closed guard only if the destructive behavior is reproduced. Do not invoke deletion against staging data. This comes before Builder Partner v3 because it contains an irreversible cross-user data-loss path; monetization drift is financially important but can be migrated prospectively without destroying existing obligations. The second slice is the Builder Partner v3 policy/terms/ledger migration in Step 2; the complete deletion lifecycle follows in Step 3.
