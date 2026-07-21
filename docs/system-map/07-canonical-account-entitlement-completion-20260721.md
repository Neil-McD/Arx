# Canonical Account Entitlement Completion Receipt

Date: 2026-07-21

Lane: `codex/semantic-platform-staging-20260719` / `polynet-staging.vercel.app` / `dev:quick-porcupine-949`

Scope: F-002 only. Builder Partner, production, community-paid access, and premium-tool accounting were not changed.

## Irreducible outcome

Platform tier now has one data shape, one reader, and one writer rule:

1. no row means Free;
2. only `admin_override` and `premium_subscription` are valid sources;
3. each source owns at most one current row;
4. all readers call one bounded, deterministic, fail-closed authority;
5. both writers update their source row monotonically and idempotently.

Deleted residue: default rows and provisioning, append-history revisions, the `default` and platform `manual_grant` source variants, `by_user_startsAt`, seven independent reader algorithms/helpers, the operator "any Architect wins" rule, and the temporary audit/migration functions.

## Decision rule

The authority reads at most three indexed rows. More than two rows, duplicate sources, unsupported sources, malformed windows, or conflicting same-time tiers return Free with a corruption reason. Otherwise, the active row with the latest `startsAt` wins; windows are half-open. A Premium cancellation is a zero-length inactive tombstone, so it cannot override an older independent admin grant.

For a source write: an older revision is ignored as stale, an identical replay is a no-op, a same-time different payload becomes an inactive Free tombstone, and a newer revision patches the existing row. No normal writer appends history. This makes an ambiguous provider sequence deny access until a strictly newer revision converges it.

## Staging normalization receipt

- The complete preflight covered all 91 entitlement rows for 78 users: 79 `default`, 12 `admin_override`, zero Premium, manual, or unsupported rows.
- Two `(user,source)` pairs had duplicate history; one pair contained 11 rows. No current or future-boundary decision conflicts existed.
- The target retained the newest admin row for each of two users and deleted 89 rows: 79 defaults plus ten stale admin revisions.
- The expectation-locked dry run and mutation both preserved the full-user current result: 77 Free and one Architect. Every relevant future boundary also had exact parity.
- The post-migration audit contained exactly two rows, no duplicate source pair, no unsupported source, and at most one row per source/user.
- The idempotency rerun proposed and deleted zero rows. The temporary migration module was then removed.

## Executable proof

- `accountEntitlementAuthority.test.ts` covers absence, half-open boundaries, invalid evaluation time/tier, corruption failure, latest-source selection, independent-source cancellation, stale delivery, exact replay, fail-closed same-time conflict and recovery, and bounded row growth.
- `account_entitlement_authority_guard.sh` forbids direct production table readers, legacy schema sources/indexes, and retained migration code; it requires the canonical reader at every known product projection and the monotonic writer at both sources.
- The guard and behavioral proof are part of the foundation baseline.
- Focused actor, billing, Premium badge, community-limit, and gate-parity proofs protect the affected consumers.

## Score

| Dimension | Score | Evidence | Why not higher |
| --- | ---: | --- | --- |
| Simplicity | 9 | absence is Free; two sources; one reader; one writer primitive | account tier and effective gate tier remain deliberately separate concepts |
| Scalability | 9 | constant-size storage and at most three indexed reads per decision | Convex does not enforce source-pair uniqueness at the database index level |
| Reliability | 8 | monotonic source ownership, exact replay, stale rejection, deterministic precedence and conflict recovery | a live delayed/out-of-order Stripe drill remains operational evidence |
| Security | 8 | every ambiguity and corrupt shape fails closed to Free | out-of-band database writes must remain operationally prohibited |
| Robustness | 8 | current/future parity, expectation locks, conflict abort, idempotent migration | provider outage/reordering is proven in the core fixture, not against live Stripe |

This closes only the canonical platform-entitlement slice. Community subscription authority, usage ledgers, Builder Partner, and broader lifecycle work remain separate.
