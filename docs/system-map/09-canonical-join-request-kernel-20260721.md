# Canonical Join-Request Kernel Completion — 2026-07-21

## Outcome

The staging lane now has one irreducible join-request model:

- `communityMemberships` is the sole durable community-access authority.
- `communityJoinRequests` is temporary admission state only.
- A community/user pair has zero or one request row.
- A row is either `pending` or `denied`.
- Approval activates membership and deletes the request in the same transaction.
- Cancellation deletes `pending`; repeated cancellation is a no-op.
- Denial retry preserves the original denial window.
- Reapplication after expiry changes the same row back to `pending`.
- Open access and paid-policy entry cannot derive access from a request.
- Every membership activation consumes any residual request.

No frontend redesign, production deployment, partner change, billing redesign, or protected-core deletion was part of this slice.

## Authority and transition contract

| Input/state | Canonical result |
| --- | --- |
| no request + approval policy | insert one `pending` row |
| `pending` + repeat apply | same row, no write |
| `pending` + cancel | delete row |
| `pending` + approve | activate membership, delete row |
| `pending` + deny | same row becomes `denied` with valid timestamps |
| `denied` + repeat deny/removal | same row and original window |
| expired `denied` + apply | same row becomes `pending`; denial fields clear |
| open policy + pending | activate eligible user and delete row |
| open policy + ordinary denial | denial does not grant or continue blocking; explicit join activates and deletes |
| paid policy + request | delete temporary admission state; verified purchase remains required |
| any authorized activation | activate/reactivate one membership row and delete residual request |

Invalid statuses, invalid denial fields, duplicate pairs, owner requests, active-member approvals, blocked-user approvals/activations, stale request IDs, and approval under paid policy fail closed.

## Staging migration receipt

The schema-compatible prevention checkpoint was `fde24d59`.

Preflight before mutation:

- total rows: 1
- status: `approved`: 1
- approved row with exactly one active membership: 1
- duplicates, unknown statuses, malformed rows, owner rows, active current-state rows, missing users/communities, and unsafe approvals: 0
- `safe_to_migrate`: true

The expectation-locked mutation deleted exactly that one `approved` row. The second preflight returned zero rows and remained safe. A second mutation with all expected counts set to zero deleted zero rows. The temporary migrator was then deleted.

## Proof surface

- 37 persisted behavioral tests cover concurrency, repeat application/cancel/deny, same-row reapplication, approval consumption, stale/non-pending/owner/active/blocked/paid guards, open and paid transitions, residual cleanup, and malformed/duplicate failure.
- Convex and web TypeScript checks pass.
- Access lifecycle, access audit, admin, billing lifecycle, role-policy, public-identity, and member-entry proofs pass for the affected boundary.
- The final schema validator accepts only `pending | denied`.
- The read-only access audit reports duplicate pairs, owner rows, invalid status/fields, and active membership with a residual request.

## Result against the 8/10 goal

| Dimension | Result | Evidence |
| --- | ---: | --- |
| Simplicity | 9 | four statuses and history-like terminal rows collapse to two current states and deletion |
| Scalability | 8 | indexed unique-pair reads; bounded 100-row policy cleanup with continuation |
| Reliability | 9 | serializable one-row transitions, idempotent retries, locked/idempotent migration |
| Security | 9 | membership remains sole access authority; owner/block/paid/stale/duplicate paths fail closed |
| Robustness | 9 | malformed state is rejected; activation always cleans residual admission state |

The next dependency-ordered cleanup target is no longer join admission. Resume Step 4 only for separately bounded identity/access risks, or move to the next highest causal item in the roadmap after a fresh ground-truth review.
