# Authenticated Identity and Session Continuity Completion Receipt

Date: 2026-07-20

Lane: `codex/semantic-platform-staging-20260719` / `polynet-staging.vercel.app` / `dev:quick-porcupine-949`

Scope: F-001 and F-003 through F-005 only; production and unrelated access domains untouched.

Status: the original all-dimension `8/10` closure below was superseded by post-acceptance adversarial review. Refresh subject immutability is now closed on staging; retention reachability, end-to-end deadlines, malformed-cookie recovery, and bounded auth diagnostics remain open.

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
  -> require fresh provider/JWT subject evidence to equal the original verified subject
  -> reject unverifiable refresh state without commit; revoke mismatched subject state
  -> commit encrypted state in the same row at revision N+1
  -> release lease on transient provider failure

logout / terminal provider failure
  -> revoke locally first
  -> assign seven-day indexed purge timestamp
  -> bounded best-effort provider logout (5-second timeout)
  -> clear browser only after local authority confirms

hourly retention
  -> internal cron
  -> indexed due-row selection for rows already assigned purgeAfterAt
  -> at most 500 deletions per transaction
  -> untouched absolute expiry and full-batch continuation remain open
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
- stable browser credential on successful, retryable, and subject-unverifiable refresh;
- terminal local revocation with no credential commit for provider-user or fresh-JWT subject drift;
- absolute expiry, revocation, unsupported secret version, and terminal purge behavior;
- local-before-provider logout, retryable local failure, and provider-failure convergence;
- multi-batch indexed retention with eventual drain;
- diagnostic coverage for bootstrap, refresh, contention, commit loss, logout, and provider failures;
- structural absence of rotation, replacement, legacy lookup, public migration, and full-table maintenance.

The focused suites now contain 30 passing behavioral tests: four actor-authority, sixteen security/route, and ten persisted state-machine tests. Convex and web typechecks, the production web build, and the canonical foundation gate all pass. The restricted gate run stopped only at the known `tsx` local-IPC `EPERM`; the identical gate passed outside that runner restriction.

## Current score after adversarial review

| Dimension | Score | Evidence | Why not higher |
| --- | ---: | --- | --- |
| Simplicity | 8 | one subject selector, one credential row, one refresh transition, one retention owner; no new state or endpoint was needed for subject immutability | provider payload normalization still supports multiple upstream response shapes |
| Scalability | 6 | refresh creates no replacement rows and lookup is indexed | untouched expiry is not purge-reachable; prune capacity is fixed; normal bootstrap diagnostics remain unbounded |
| Reliability | 7 | stable cookie, revisioned lease, explicit outcomes, local-authoritative logout | bridge calls have no application deadline and provider body consumption is not covered by the current timer |
| Security | 8 | refresh now rejects absent subject evidence and terminally revokes any provider/JWT subject drift before commit | malformed-cookie and optional parent-domain cookie hardening remain open |
| Robustness | 7 | contention, commit-loss, subject-drift, and unverifiable-response behavior are explicit and tested | malformed cookies can throw and external request stalls are not fully bounded |

The original blanket `8` is no longer treated as current truth. The subject-immutability sub-slice meets its security outcome; the remaining dimensions stay open until their named falsifiers pass.

## Final acceptance

Accepted on the staging code commit `b03b7eac16c6dc99e4436e96d66e465eb086969c`:

- the commit was pushed only to `codex/semantic-platform-staging-20260719` and deployed by the `polynet-staging` Git path;
- `https://polynet-staging.vercel.app/version.json` reported that exact build and Sentry release;
- the already-signed-in pre-cutover browser session survived migration and final schema deletion;
- a reload on the deployed build remained at `/c/polynet/chat`, rendered the authenticated profile and `Active now`, showed no sign-in control, and emitted zero browser warnings/errors;
- the post-reload full scan remained exactly 1,069 rows with zero malformed hashes, invalid revisions, expired/missing lifetimes, legacy fields, or scan overflow;
- production was not pushed, deployed, data-queried, or mutated; its public version marker remained `a936dee72a65f91723f332779390210e4cf783f0`.

This was the historical acceptance statement. It is superseded by the adversarial review and correction receipt below.

## Subject-immutability correction acceptance

Accepted on staging code commit `382dcb400fc2ba516efe461634bcfec742be8308` on 2026-07-20 EDT / 2026-07-21 UTC:

- provider `user.id`, fresh ID-token `sub`, and fresh access-token `sub` signals are collected independently before refresh state normalization can fall back to stored identity;
- zero observed subject signals produce a transient, lease-releasing no-commit result; any observed mismatch terminally revokes locally, assigns purge timing, clears refresh ownership, and returns no refreshed credential;
- four actor-authority, sixteen security/route, and ten persisted state-machine tests pass, including matching concurrency, explicit provider drift, conflicting JWT drift, unverifiable success response, and terminal browser-cookie clearing;
- Convex and web typechecks, `git diff --check`, the production web build, and the complete foundation baseline pass;
- the exact clean commit deployed first to `dev:quick-porcupine-949`, then the Git-driven canonical staging marker reported the same build and Sentry release;
- a reload of the existing signed-in browser session remained at `/c/polynet/chat`, rendered the authenticated profile and member chat surface without a sign-in control, and emitted zero browser warnings/errors;
- production was not pushed, deployed, data-queried, or mutated; its public version marker remained `a936dee72a65f91723f332779390210e4cf783f0`.

The subject-immutability slice is complete. F-005 retention reachability is the next separate slice; no other reviewed gap was changed here.
