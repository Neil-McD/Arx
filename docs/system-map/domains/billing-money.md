# Domain Dossier — Billing, Entitlements, Credits, Commissions, and Payouts

## Irreducible jobs

Polynet needs only three launch-critical money jobs:

1. verify paid community access and remove it when provider truth changes;
2. enforce platform/AI/tool usage limits without double charging;
3. route ordinary community revenue to the community builder through the existing Stripe Connect flow.

Builder Partner is a retained fourth, secondary growth economy—not a launch gate. Its minimum coherent job is to bind an eligible referral, accrue a versioned percentage of settled community revenue from Polynet's platform fee, and safely pay/reconcile that obligation. It must not participate in paid-tool usage.

## Authority split

| Concern | Owner | Local role |
| --- | --- | --- |
| checkout/payment/subscription settlement | Stripe | idempotent checkout/session/subscription projections and webhook receipts |
| community access | current membership plus provider-derived `communitySubscriptions` | per-request access decision |
| platform tier | `userEntitlements` history | effective tier/gate projection |
| workspace/tool usage | credit balance, reservation, usage charge/collection ledgers | reserve, settle, retry, reconcile |
| creator payout readiness | Stripe Connect account plus community commerce state | destination transfer configuration and operator visibility |
| partner obligation | Builder Partner attribution, versioned commission, adjustment, payout batch/transfer/item ledgers | secondary growth policy plus financially retained liability/history |

Redirects and client success screens are UX only. `checkout_finalize` remains idempotent; webhook/provider verification is authoritative.

## Four economies currently coupled

1. **Community commerce:** paid join checkout and creator destination revenue in `communityCommerce.ts`/`creatorCommerce.ts`.
2. **Premium tier:** platform subscription and `userEntitlements` in `premiumBilling.ts`.
3. **Workspace/tool credits:** balances, reservations, charges, collection, auto-recharge, Stripe customer in `workspaceCredits.ts`, `workspaceAutoRecharge.ts`, and related modules.
4. **Builder Partner:** seven dedicated partner/commission/payout tables and 3,533-line `builderPartners.ts`, coupled into Connect state, webhooks, community commerce, workspace credits, settings, Workspace, operator UI, legal terms, and two crons. Current economics include 5% community revenue and paid-tool usage; the accepted target is prospective 4% community-only revenue.

These are not one domain merely because Stripe participates. They have different buyers, beneficiaries, authority rules, ledgers, and retention duties.

## Resolved direction and remaining drift

Current direction retains Builder Partner but demotes it from a primary MVP journey. The active system is not dead code: it enrolls users, captures attribution, accrues commissions, advances them daily, creates payout cycles, and exposes member/operator UI. The drift is now precise: paid-tool commissions, the prospective 5% formula, stale legal-policy lineage, and primary Workspace/onboarding prominence do not match the accepted target.

The bounded staging audit found active partners and pending financial state, so wholesale deletion remains unsafe. The simplification sequence is: define v3 terms/economic policy -> stop paid-tool accrual and the old prospective formula at one versioned boundary -> preserve and reconcile pre-v3 obligations -> require v3 for new eligible accrual -> remove primary-surface coupling -> retain the minimum secondary enrollment/status/operator/payout machinery.

## Duplication and scale

- Platform tier resolution is independently implemented in `auth.ts`, `entitlements.ts`, and `gates.ts`, each collecting and sorting entitlement history.
- `convex/billing.ts` re-exports ten registered functions that also remain available from their source modules.
- Account deletion must understand community commerce, credits, Connect, and Builder Partner history, amplifying destructive-lifecycle risk.
- Operator money aggregation performs broad table reads and per-community lookups rather than a bounded materialized read model.
- Credit jobs generally use explicit limits, leases, retry states, and settlement semantics; this is comparatively strong and should be preserved while reducing product scope.

## Failure and recovery questions

Static code clearly separates provider verification from redirects, but runtime behavior remains unproven for delayed/out-of-order webhooks, disputes, refunds, subscription reversal, Connect unavailability, charge collection failure, and idempotency across deployment retries. These require provider fixtures and redacted staging receipts, not source inspection alone.

## Reduction candidates

| Candidate | Classification | Action | Idiot index | Rationale |
| --- | --- | --- | ---: | --- |
| provider-verified community access and ordinary creator payout | `KEEP (MVP core)` | `HARDEN` | 0 | required for gated paid communities and builder economics |
| one shared entitlement resolver | `KEEP (MVP core)` | `CONSOLIDATE`, `BOUND` | 1 | one job is required; three algorithms are not |
| Builder Partner as a secondary growth capability | `KEEP (MVP core)` | `DOCUMENT`, `HARDEN`, `CONSOLIDATE` | 2 | explicitly retained; not a launch gate or primary product journey |
| paid-tool Builder Partner commission | `DELETE (deferred/dead)` | `MIGRATE_THEN_DELETE`, `VERSION` | 10 | explicitly removed from the target economics; preserve historical rows |
| 5% prospective community-revenue formula | `DELETE (deferred/dead)` | `MIGRATE_THEN_DELETE`, `VERSION` | 8 | replace with 4% only for new eligible commissions |
| Builder Partner advancement/payout machinery | `KEEP (MVP core)` | `HARDEN`, `DOCUMENT` | 3 | needed to settle retained obligations; must enforce policy version, risk, approval, and idempotency |
| Builder Partner coupling to primary Workspace/onboarding UI | `DELETE (deferred/dead)` | `MIGRATE_THEN_DELETE` | 9 | retained program belongs in coherent secondary Settings/operator surfaces |
| ten `billing.ts` transport aliases plus source-module surfaces | `KEEP (MVP core)` | `CONSOLIDATE` | 6 | transport compatibility may be needed; duplicated callable identity should not be permanent |
| workspace/tool credit accounting | `KEEP (MVP core)` | `DOCUMENT`, `HARDEN` | 3 | protected harness capability depends on it, although standalone Workspace is deferred |

## Correct decomposition target

Use one provider event kernel and separate bounded policies for community subscription, premium tier, usage credit, creator settlement, and Builder Partner. Share money/idempotency primitives; do not share business state machines merely to reduce files. Builder Partner v3 must record its policy version and rate basis on every new obligation.
