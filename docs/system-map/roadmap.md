# Dependency-Ordered Reduction Roadmap

This is a plan, not authorization. Every implementation slice gets its own clean diff, staging proof, rollback boundary, and explicit approval. Protected core is never deleted without human confirmation.

## Current position after the read-only audit

The aggregate staging shape work in Step 0 is complete for identity/membership compatibility, legacy interactions/resources/retrieval, Builder Partner state, anonymous users, scheduler thresholds, and selected retention tables. The two blocking product decisions are also recorded: Builder Partner is retained as a secondary capability under a prospective community-only 4% model, and account deletion must preserve/anonymize shared state while deleting private state. Exact retention periods and several unrelated architecture decisions remain open, but they do not block the first isolated safety fixture.

## Current implementation checkpoint

The account-deletion safety fixture, declarative lifecycle ownership policy, Builder Partner v3 economics, removal of the unreachable legacy deletion executor, community-deletion quarantine, first static deletion slice, explicit-active membership cutover, unique membership-pair authority cutover, required active-member-count cutover, owner-membership authority cutover, canonical account-entitlement cutover, platform-home admission separation, canonical join-request kernel, public-funnel admission load/action freshness boundary, public community checkout-start effect boundary, paid-community subscription-event convergence, paid-member cancellation authority, authority-surface reduction, and legacy onboarding storage closure are complete on the isolated staging lane. Join requests now have one current row per community/user pair, store only `pending | denied`, grant no access, and are deleted by approval, cancellation, paid-policy entry, open activation, or any other canonical membership activation. The public funnel consumes this state only through the canonical community-access bundle; the duplicate request query, mapper, aliases, gateway, React state, loading state, optimistic request patch, indefinite pending-join storage, duplicate replay effect, ID-only resume shape, client ID mutation branch, alternate controller, and unused backend `primary_cta` policy are deleted. Signed-in funnel loads and join/cancel results are bound to one canonical lowercase slug, route or explicit resume intent, authenticated subject, and request/action generation; only the active operation clears shared loading, route/account invalidation occurs after commit, ambiguous mutations reconcile through canonical access, malformed join responses fail closed, stale/blocked/malformed/unavailable access cannot produce admission effects, preview performs no authenticated access lookup, and same-subject token refresh remains current. The asynchronous join/cancel decision path is behaviorally exercised outside React under delayed, reordered, malformed, and ambiguous outcomes. Typed 24-hour auth-resume state is the sole join-continuation owner. Public community checkout start now has one caller-owned, indexed, frozen attempt per accepted intent; local and Stripe effects converge through one deterministic provider key; ambiguous failure retains reconciliation state; provider expiry is separate from claim redemption; and only the current route, subject, plan, and generation may redirect. Paid-community subscription, refund, dispute, and member-cancellation paths now re-read current Stripe state before projecting access through one lifecycle; the old local-only paid leave path fails closed, period-end cancellation retains access, and provider failure cannot mutate local state. One atomic mutation converges explicit blocks, subscription and membership projections, member count, and an identity-only bounded receipt. One shared policy owns access-granting subscription statuses, and unused compatibility surfaces, purchase-claim audit, duplicate reporting-policy surfaces, the duplicate subscription-event queue, and its verified-empty physical development table are deleted. A real staging checkout/cancellation acceptance journey and creator settlement remain under U-017. Platform-home autojoin intent belongs to the existing membership relationship; its magic join-request sentinel and duplicate removal representation are deleted, and inactive manager/ban state cannot be erased through member leave. The deprecated `communities.memberOnboarding` field, empty `agentLifecycleActivations` table, zero-work migration module, generated API, and lifecycle-policy residue are deleted from staging; canonical community onboarding and the separately bounded cached-client member-entry shim remain. Production promotion is explicitly blocked until its three legacy field values and two activation rows are cleared by the currently deployed bounded functions. F-001 and the core authenticated session-continuity slice are also closed: verified `authSubject` is the sole account-binding authority; each sign-in creates one hashed, absolutely expiring server credential; refresh is an in-place single-owner state transition; logout is local-authoritative; terminal retention is indexed, bounded, internal, and scheduled; malformed session/flow cookies clear deterministically before bridge work; one 10-second Convex-to-provider deadline spans headers plus body for PKCE and refresh; and one 15-second route-wide deadline spans Vercel-to-Convex headers plus body, including both callback calls. The outer browser-to-Vercel deadline and bounded routine-success diagnostics remain contained hardening slices. The staging replacement ledger, missing-active membership backlog, duplicate membership-pair backlog, 35-row member-count cache backlog, two unreferenced owner-membership residues, and one legacy approved join-request row were closed before their compatibility/migration surfaces were deleted. Both destructive public lifecycles are now zero-effect quarantines; their bounded resumable replacements remain open.

The paid-community access-authority kernel is also complete on staging: first verified Stripe completion atomically creates the membership/subscription identity, checkout success is observational, duplicate identity fails closed, paid cancellation is provider-first and period-end, and the purchase-claim plus duplicate-recovery surfaces are deleted after their respective migrations and zero-state proofs. Dependency-advisory reachability and remediation are complete: all three package graphs audit at zero, compatible Daytona/Blaxel descendants are pinned without replacing either reachable provider SDK, and both providers passed bounded staging diagnostics. F-043 is technically complete on staging: canonical CI automatically enforces Node 22 clean installs, low-threshold audits, the 38-step foundation baseline, web typecheck, production build, bundle budget, and one exact-build anonymous public-funnel browser/runtime journey. Required-check enforcement remains operationally blocked until the private-repository account supports it. The user explicitly accepted deferring the remaining real Stripe checkout/cancellation and Connect-settlement receipts under U-017. C2.0A truth reconciliation, C2.0B anonymous-cleanup deletion, the C2.1 zero-effect account lifecycle checkpoint/receipt kernel, C2.2A authenticated actor-authority consolidation, C2.2B single-account lifecycle-root simplification, and the anonymous hash-only community-funnel analytics closeout are complete on the canonical staging lane; all 56 development roots remain unchanged under U-013. C2 remains fail-closed and blocked before access freeze until C3 canonicalizes resource, interaction, and intelligence authority. C3.1A resource-body authority is complete on development staging: 10 resources now map one-to-one to 10 canonical content rows, legacy inline/hash/migration fields and the public compactor are deleted, corruption fails closed, and no temporary migration function remains. C3.1B resource UI list/read authority is also complete: one bounded metadata directory replaces duplicate list calls and per-row body amplification, selected bodies load through one exact authorized read, stale responses fail closed, and the signed-in edit/save/restore journey passes. C3.2A interaction truth reconciliation is complete: current canonical and legacy jobs are separated, all 67 legacy messages have valid canonical links, four attachment fallbacks and the remaining reaction/featured state are measured, recent context/evidence are confirmed canonical, and digest/featured requirements are explicitly undecided. C3.2B deletes the normal web preload, readiness, and scroll-pagination dependency on legacy chat state; canonical projection loading/error/empty behavior now stands alone and stale-community roots are synchronously excluded. C3 remains active. The missing C1 evidence remains visible rather than being represented as complete.

## Step 0 — Freeze decisions and gather minimum live shape

No product write.

1. **Resolved:** retain Builder Partner as a secondary capability; remove paid-tool commission eligibility; move new eligible community-revenue commissions prospectively from 5% to 4%; preserve previously earned ledger economics.
2. **Resolved in C0:** protected Workspace/harness means capability substrate and bounded compatibility; no standalone user-facing Workspace destination remains required.
3. **Resolved at the ownership level:** hard-delete private state, anonymize shared state, preserve minimum financial/legal evidence, and propagate explicit privacy purges through derived intelligence. Exact TTLs remain for finance/legal/security owners.
4. **Complete:** run bounded redacted staging aggregates for identity, membership, entitlement, legacy interactions/resource bodies, Builder Partner liabilities, anonymous users, and retention-state prevalence.
5. Record external official-MCP consumers and supported callable Convex names before transport retirement.

Gate: no ambiguous system is called dead and no financial/shared record is removed.

## Step 1 — Contain irreversible lifecycle risk

Smallest first implementation slice.

1. **Complete:** reproduce the legacy account-deletion blast radius with a two-user shared-data fixture, then replace the executor with a verified-actor quarantine and remove its first-party call path.
2. **Complete:** replace the active community-deletion cascade with a verified-owner quarantine; remove its first-party gateway/controller/modal/action; preserve the bounded cognition drain only for already-scheduled historical cleanup.
3. Keep both cached-client RPC identities deterministic and inert until Step 3 has resumable lifecycle receipts.

Exit proof: current and stale clients cannot execute either destructive cascade; representative fixtures remain unchanged, repeated attempts are inert, and no staging record is deleted or migrated.

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
5. **Canonical join-request kernel and access/action projection complete on the staging lane:** platform-home autojoin preference is membership-owned; request storage is one current row per pair with only `pending | denied`; approval/cancel/activation consume the row; denial retry preserves the original window; expired denial reuses the same row; paid and open transitions converge deterministically; duplicates, malformed state, owners, blocks, stale approvals, and paid approvals fail closed. The public funnel derives pending, denied, and reapply state from `getMyCommunityAccessBySlug` rather than a second request query or React state owner. Signed-in loads and join/cancel results accept a response only for the canonical lowercase slug, current route or explicit auth-resume intent, authenticated subject, and request/action generation; ambiguous mutations reconcile through the access bundle; only the active operation clears loading; committed route/account changes invalidate stale actions without mutating render; blocked, malformed, verifying, and unavailable states expose no admission action; preview skips authenticated access resolution; raw token refresh with the same subject remains current. The slug-only browser gateway rejects null, malformed, or empty-ID join results, and the asynchronous decision path has executable delayed/reordered failure proof. Typed TTL-bounded auth-resume state is the sole join-continuation owner; the indefinite pending-join keys, duplicate replay effect, ID-only resume shape, client ID mutation branch, alternate controller, optimistic request projection, render-phase authority mutation, and unused `primary_cta` policy are deleted. The one safe legacy `approved` row was deleted only after its active membership was verified, and the migration proved a zero-work rerun before its surface was deleted.
6. **Complete on staging:** consolidate entitlement resolution into one bounded fail-closed owner; make absence Free; constrain storage to one row for each of two current sources; make writers monotonic and idempotent; delete defaults, history, legacy sources/index, and the temporary migration.
7. **Complete on staging:** public checkout initiation is caller-idempotent; responses/redirects are bound to the initiating subject, community, plan, and latest operation; first verified Stripe completion atomically creates the membership/subscription authority; checkout success is observational; duplicate subscription identity fails closed; and the redundant purchase-claim architecture is deleted. U-017 retains the remaining provider lifecycle convergence.

Exit proof: verified actor, membership, block, subscription, and tier invariants hold under duplicates, stale clients, concurrency, and provider delay.

## Step 5 — Guarantee eventual service and real CI

1. Add durable cursor/partition state for memory sweep, AI prune, digests, and recurring reminders.
2. Prove fairness above each current cap and across restarts.
3. **Technically complete on staging:** web dependency install, typecheck, production build, bundle budget, and an exact-build anonymous public-funnel browser/runtime journey are automatic. Enable required-check enforcement when account support exists; do not multiply browser journeys without a distinct launch-risk owner.
4. Classify 253 `check:*` commands by unique invariant and CI/release/dev owner; merge/delete redundant lexical proofs only after stronger behavioral proof exists.
5. Define audit/diagnostic/runtime receipt retention and bounded operator queries.

Exit proof: every eligible object eventually receives service, and the canonical gate defends the actual shipped app.

## Step 6 — Finish canonical data migrations

1. Canonical interactions: **normal web legacy preload/readiness deletion complete**; next delete unreachable legacy UI mutations, decide digest/featured requirements, migrate only retained attachment/reaction/featured history, replay/observe zero, and remove backfill/link/chat residue.
2. **Complete on staging:** resource contents have one canonical body owner, no inline compatibility fields or compactor, and a bounded metadata directory plus exact authorized body reads.
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

1. **Destination decision complete in C0:** inventory and migrate callers, then remove route builders/controllers/host paths that are not protected substrate.
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

This recommendation is complete: the isolated account fixture reproduced the destructive blast radius, both account and community destructive executors are now quarantined, Builder Partner v3 is prospective and versioned, and no deletion was invoked against staging data. Step 3 remains the eventual replacement rather than an authorization to restore either executor.
