# Partner Commission Settlement Backfill Runbook

Status: active
Scope: Builder Partner commission settlement materialization

## Purpose

Partner commission rows now carry materialized settlement fields:

- `commissionSettlementCents`
- `adjustmentSettlementCents`
- `reservedSettlementCents`
- `settledSettlementCents`
- `netSettlementCents`
- `openSettlementCents`
- `payoutOpen`
- `payoutDebt`
- `settlementUpdatedAt`

Adjustment rows and payout items remain the audit truth. This backfill only recomputes the materialized projection on existing commission rows so payout planning and partner dashboard reads can stop relying on legacy fallback recomputation.

## Safety Rules

1. Run one commission status at a time.
2. Use an explicit Convex target: `--dev`, `--prod`, `--deployment-name`, or `--preview-name`.
3. The runner is dry-run by default. It mutates data only with `--execute`.
4. Production runs require the validated code to be deployed to the target Convex deployment first.
5. Production runs require an operator auth subject in `POLYNET_OPERATOR_AUTH_SUBJECT` or `OPERATOR_AUTH_SUBJECT`.
6. Do not run any Vercel release command for this backfill.

## Dry Run

```bash
cd /Users/neilmcdevitt/code/arx
npm run maintenance:partner-settlement-backfill -- --dev --status payable
```

The dry run prints the exact target, status, limit, checkpoint, and function name without calling Convex.

## Execution

Run the statuses separately:

```bash
cd /Users/neilmcdevitt/code/arx
export POLYNET_OPERATOR_AUTH_SUBJECT="<operator-auth-subject>"
npm run maintenance:partner-settlement-backfill -- --prod --status locked --execute
npm run maintenance:partner-settlement-backfill -- --prod --status risk_hold --execute
npm run maintenance:partner-settlement-backfill -- --prod --status payable --execute
npm run maintenance:partner-settlement-backfill -- --prod --status voided --execute
```

The runner calls `builderPartners:backfillPartnerCommissionSettlementStateForOperator`, which requires operator access and records the `builder_partner_commission_settlement_backfilled` critical audit event.

## Checkpoint Resume

If the runner stops with `backfill_incomplete`, resume the same status from the reported checkpoint:

```bash
npm run maintenance:partner-settlement-backfill -- --prod --status payable --after-created-at 1770000000000 --execute
```

Useful caps:

```bash
npm run maintenance:partner-settlement-backfill -- --prod --status payable --limit 250 --max-batches 20 --execute
```

## Completion Standard

A status is complete when the summary returns:

- `complete: true`
- the last batch scanned `0`
- no `backfill_incomplete` error

After all four statuses complete, the next cleanup slice can remove or reduce legacy settlement fallback paths, but only after targeted partner payout and dashboard checks still pass.
