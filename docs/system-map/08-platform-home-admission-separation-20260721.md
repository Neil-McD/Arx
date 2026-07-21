# Platform-Home Admission Separation Receipt

Date: 2026-07-21

Lane: `codex/semantic-platform-staging-20260719` / `polynet-staging.vercel.app` / `dev:quick-porcupine-949`

Scope: platform-home autojoin preference and re-entry only. The general join-request state machine, frontend funnel projection, Builder Partner, and production were not changed.

## Irreducible outcome

The existing membership relationship is now the sole platform-home autojoin authority:

1. no membership means a new eligible user may be autojoined;
2. an active membership means the user is already a member;
3. an inactive membership disables autojoin;
4. voluntary leave records `left_by_member` on the same inactive membership row;
5. explicit join after voluntary leave reactivates that same row;
6. manager removal or ban retains its revocation reason and the ordinary denial/reapproval path;
7. owner authority remains `communities.ownerId` and never creates membership or join-request state.

Deleted residue: the `platform_home_autojoin_opt_out` magic message, its join-request classifiers, list/sort reader, clear/upsert writers, second-row removal representation, and moderator-list filtering.

## Security boundary

`leaveCommunity` can no longer turn a manager or ban revocation into a voluntary leave. An inactive non-left relationship fails closed, while retrying an already-completed platform-home leave is idempotent. This preserves the 14-day manager-removal cooldown and subsequent human reapproval even though the platform home is open.

## Executable proof

- `platformHomeAdmission.test.ts` covers new and repeated autojoin, voluntary leave and retry, bootstrap after leave, explicit reactivation, manager removal and retry, cooldown denial, post-cooldown approval request, approval reactivation, ban/unban, owner exclusion, sentinel absence, and concurrent convergence.
- `communityMembershipAuthority.test.ts` continues to prove one fail-closed membership pair, activation/reactivation identity, owner exclusion, onboarding, and member-count integrity.
- The member-entry, community-access lifecycle/state-audit, admin, and community-app lifecycle contracts protect the surrounding call paths.

## Staging deployment receipt

Pending final Dev Convex deployment and post-deploy redacted aggregate.

## Score for this slice

| Dimension | Score | Evidence | Why not higher |
| --- | ---: | --- | --- |
| Simplicity | 8 | one existing relationship replaces a magic message and duplicate join-request role | the general join-request kernel still retains four statuses and history-like rows |
| Scalability | 8 | bootstrap uses one indexed unique membership-pair read and no request collect/sort | explicit admission still sorts pair request history |
| Reliability | 8 | deterministic leave/rejoin/removal behavior with persisted retry and concurrency fixtures | the broader cancel/reapply transition defects remain downstream |
| Security | 8 | inactive relationships fail closed and leave cannot erase manager/ban revocation | moderator transition hardening remains in the next kernel slice |
| Robustness | 8 | same-row reactivation, retry convergence, block preservation, and owner exclusion | no live destructive mutation was needed or performed |

This completes platform-home admission separation only. The next dependency-ordered slice is the canonical join-request kernel: one current row per community/user pair, only `pending | denied`, strict transition guards, and deletion on approval/cancel.
