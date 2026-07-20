# 05 — Decision Record: Builder Partner and Data Ownership

Status: product direction accepted 2026-07-20; planning authority only; no behavior or financial state changed.

## Decision 1 — Keep Builder Partner, demote its prominence, simplify its economics

Builder Partner is retained as a Polynet growth capability. It is not a deletion candidate and is not a primary MVP journey or launch gate. It should remain a secondary Settings/operator capability rather than a Workspace, onboarding, or headline product surface until its revised financial contract is deployed and proven.

### Prospective economic model

1. Partner commissions apply only to eligible referred **community revenue**.
2. The prospective commission rate is **4%**, replacing 5%.
3. Paid-tool usage is not an eligible Builder Partner commission stream.
4. Premium/platform subscription revenue is not eligible unless a later explicit decision adds it.
5. Partner commission comes entirely from Polynet's platform fee and never reduces the community builder's payout.
6. Revenue must be settled and net of refunds, disputes, chargebacks, reversals, and taxes excluded from revenue.
7. Commission may never exceed the platform fee actually retained for the transaction.
8. Existing risk hold, payout buffer, operator approval, payout readiness, adjustment, and clawback controls remain.

At the current 10% platform fee, the intended waterfall is conceptually:

```text
eligible settled community revenue       100%
community builder                         90%
Builder Partner                            4%  (from Polynet's fee)
Polynet retained before its direct costs   6%
```

This is viable only if the retained 6% covers Polynet's processor, support, risk, infrastructure, and other variable costs for the community transaction. The improved platform monetization model must therefore explicitly decide who bears payment-processing cost and what minimum retained contribution Polynet requires. If the platform fee ever falls below the partner rate plus that floor, commission must fail closed or be recalculated under a new prospectively accepted policy.

### Version and transition rules

- Already-earned v1/v2 commissions remain governed by the economic policy and terms under which they were created.
- No earned ledger row is retroactively reduced from 5% to 4%.
- Existing pending batches/transfers are reconciled and either honored, held, or voided under their original evidence and terms.
- New enrollment and new commission accrual must require revised terms and an explicit new economic-policy version.
- Revised terms remove paid-tool commissions and state 4% community-revenue economics.
- Every future commission row must record its economic-policy version and rate basis.
- Until the revised contract is live, Builder Partner should not be promoted or expanded through new primary surfaces.

### Remaining bounded financial decisions

1. Confirm the platform take rate used by the improved monetization model.
2. Assign Stripe/payment-processing costs among builder, Polynet, and transaction price.
3. Define the partner earning duration after a referral binds; do not leave lifetime liability implicit.
4. Confirm whether 4% is calculated before or after explicit discounts; recommendation: actual settled customer revenue after discounts.
5. Confirm tax/reporting and retention periods with finance/legal owners.

## Decision 2 — Separate account deletion from shared-content deletion

The governing rule is:

> Hard-delete private state, anonymize shared state, preserve minimum financial/legal evidence, and propagate explicit privacy purges through derived intelligence.

| Data class | Default deletion behavior | Owner after account deletion |
| --- | --- | --- |
| sessions, credentials, tokens, private provider state | revoke and hard-delete | none |
| profile details, personal memory, private workspace state | export if requested, then hard-delete | none |
| DMs shared with another participant | retain sequence/content for remaining participant; sever account identity and show a deleted-member tombstone | remaining conversation participants |
| specifically deleted DM content | replace with a durable tombstone for all participants | conversation history only |
| community posts/replies | retain or tombstone under normal author/moderator policy; anonymize deleted actor | community |
| community resources/events created by the user | retain and transfer management continuity; anonymize contributor attribution | community owner/admin authority |
| source traces/evidence | purge private/raw source material when required; retain a privacy tombstone and non-sensitive receipt | community integrity/privacy policy |
| accepted intelligence derived from purged evidence | retain only if independently supported; otherwise mark stale/deprecated and remove from retrieval | community intelligence policy |
| finance, partner commissions, payouts, disputes, legal acceptance | retain the minimum immutable evidence needed for accounting, tax, fraud, dispute, and legal obligations; minimize identity | finance/legal authority |
| audit/diagnostic/runtime evidence | apply explicit TTL and pseudonymization; aggregate or delete after operational need | operations/security |
| backups and provider copies | revoke active access immediately; expire through documented bounded retention | provider/backup policy |

Account deletion and content deletion are different operations. Deleting an identity must not erase another person's DM history or a community's resources. A separate explicit privacy/content purge may remove authored content and must propagate to archives, evidence, retrieval, and intelligence.

### Required lifecycle

```text
deletion request
-> immediately revoke sessions and new effects
-> resolve community ownership and pending finance blockers
-> bounded private-state deletion
-> shared-state anonymization/tombstone
-> external-provider revocation
-> evidence/intelligence privacy propagation
-> orphan and invariant audit
-> terminal receipt
-> delete or irreversibly tombstone account identity last
```

Every phase needs a cursor, idempotency key, retry state, and receipt. Community owners must transfer or deliberately delete owned communities first. Builder Partners with unresolved financial state may stop new participation immediately, but their minimal ledger cannot be erased before settlement/retention duties are resolved.

### Remaining bounded retention decisions

Legal/finance/security owners still need to set explicit retention periods for payment/tax evidence, disputes, security/audit events, operational diagnostics, backups, and provider records. Those durations do not change the ownership model above.

## Causal implementation order

1. **First safety slice:** characterize account deletion with a two-user shared-DM/community-content fixture and add a temporary fail-closed blocker if the current mutation would destroy shared state. No live deletion or migration.
2. **Builder Partner v3 slice:** remove new paid-tool accrual, change prospective community commission from 5% to 4%, version every new commission, update terms/UI/proofs, and preserve existing ledger economics.
3. **Deletion lifecycle slice:** implement participant departure, deleted-actor tombstones, community-content continuity, bounded phase receipts, and root-last finalization.
4. **Privacy propagation slice:** connect content purge to source traces, archive/retrieval, and intelligence re-evaluation.
5. **Retention/operations slice:** establish TTLs, backup/restore deletion behavior, and minimized finance/audit retention.

The first slice is deliberately a safety harness and fail-closed boundary. It prevents irreversible harm while the complete deletion lifecycle and monetization migration are built in later, independently reviewable changes.
