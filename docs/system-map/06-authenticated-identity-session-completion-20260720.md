# Authenticated Identity and Session Continuity Completion Receipt

Date: 2026-07-20

Lane: `codex/semantic-platform-staging-20260719` / `polynet-staging.vercel.app` / `dev:quick-porcupine-949`

Scope: F-001 and F-003 through F-005 only; production and unrelated access domains untouched.

## Irreducible outcome

The authenticated continuity system now has four authorities:

1. the verified provider subject selects exactly one Polynet account;
2. one random browser credential selects exactly one hashed, absolutely expiring server row;
3. one revisioned lease owner may refresh encrypted provider state in place;
4. one internal scheduled owner deletes due terminal evidence in bounded indexed batches.

Everything else in the old path was deleted: mutable-email account selection, relink/continuity compatibility, predictable credential fallback, raw session IDs in storage, per-refresh replacement rows, replacement traversal, duplicated session/profile projections, refresh-time cookie rotation, public/manual pruning, the temporary migration action/script/secret, and obsolete setup guidance.

## Canonical state machine

```text
sign in
  -> secure UUID (raw value only in HttpOnly cookie)
  -> SHA-256 lookup hash + encrypted provider state
  -> absolute expiry at sign-in + 30 days

bootstrap / refresh
  -> reject missing, expired, or revoked state
  -> use valid stored access token, or claim 30-second lease at revision N
  -> one bounded provider call (10-second timeout)
  -> commit encrypted state in the same row at revision N+1
  -> release lease on transient provider failure

logout / terminal provider failure
  -> revoke locally first
  -> assign seven-day indexed purge timestamp
  -> bounded best-effort provider logout (5-second timeout)
  -> clear browser only after local authority confirms

hourly retention
  -> internal cron
  -> indexed due-row selection
  -> at most 500 deletions per transaction
```

## Staging migration receipt

- Every write invocation passed the exact staging worktree/branch/Convex/Vercel guard.
- The final controlled drain processed well over 60,000 legacy rows after the original audit's 5,000-row lower bound. Active cookie credentials were preserved by hashing; revoked/replacement rows were deleted.
- The last batch processed 331 rows and returned `done=true`, with zero skipped and zero retryable rows.
- An independent pre-deletion query reported `legacy_rows_exist: false`, zero replacement fields in the first 500 hashed rows, and zero missing/expired absolute lifetimes in that prefix.
- The final schema deployment deleted `authSessions.by_sessionId` and `authSessions.by_authSubject` and removed the compatibility functions.
- A full post-deployment bounded scan covered all 1,069 remaining rows: zero malformed hashes, zero invalid revisions, zero missing/expired lifetimes, zero legacy fields, and no overflow beyond the 5,000-row bound.
- The temporary staging migration environment secret was unset after its only caller was deleted.

## Executable proof

Focused persisted and route coverage includes:

- subject-authoritative actor idempotency and mismatch failure;
- secure UUID failure and hash collision failure before persistence;
- raw credential absence and exactly one row per sign-in;
- two real concurrent refresh actions producing one provider effect and one revision commit;
- stable browser credential on both successful and retryable refresh;
- absolute expiry, revocation, unsupported secret version, and terminal purge behavior;
- local-before-provider logout, retryable local failure, and provider-failure convergence;
- multi-batch indexed retention with eventual drain;
- diagnostic coverage for bootstrap, refresh, contention, commit loss, logout, and provider failures;
- structural absence of rotation, replacement, legacy lookup, public migration, and full-table maintenance.

The focused suites contain 26 passing behavioral tests: four actor-authority, fifteen security/route, and seven persisted state-machine tests. Convex and web typechecks, the diagnostics contract, the production web build, and the canonical foundation gate (27 executed checks) all pass. The first restricted gate run stopped only at the known `tsx` local-IPC `EPERM`; the identical gate passed outside that runner restriction.

## 8/10 score contract

| Dimension | Score | Evidence | Why not higher |
| --- | ---: | --- | --- |
| Simplicity | 8 | one subject selector, one credential row, one refresh transition, one retention owner; runtime and maintenance source decreased while behavioral proof increased | provider payload normalization still supports multiple upstream response shapes |
| Scalability | 8 | refresh creates no new rows; lookup is indexed; retention is `O(B log S)` with `B <= 500` | long-term high-cardinality metrics for the new steady state are not yet accumulated |
| Reliability | 8 | stable cookie, revisioned lease, deterministic timeouts, explicit diagnostics, local-authoritative logout | no live provider-outage drill was induced |
| Security | 8 | subject authority, hashed credential, secure RNG fail-closed, absolute expiry, no public maintenance, dead secret removed | provider and bridge secrets remain necessary trusted infrastructure |
| Robustness | 8 | explicit terminal/transient outcomes, contention/commit-loss handling, bounded retention, live zero-state migration receipt | cross-region/provider disaster recovery is outside this slice |

An 8 means the slice is complete and launch-worthy within its boundary, not that adjacent membership, entitlement, account deletion, provider recovery, or global observability work is complete.

## Final acceptance

To close this receipt, the tested commit must be deployed through the staging branch, the public staging build marker must match it, a signed-in reload/bootstrap must remain authenticated without cookie replacement, and the post-deploy 1,069-row invariants must remain green. Production must remain unchanged.
