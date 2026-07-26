# PC3C Auth/Session Production Compatibility Receipt

Date: 2026-07-24

Mode: read-only source, contract, schema, cached-client, security, complexity,
and rollback reconciliation

Requirement: P05 authenticated identity and session authority

Production source/live build:
`1a71a459e5f7b2099fa85861680642b4d7c71cc4`

Staging source/live build:
`9331f446b47285b1b14ddd6d04998e683f0184de`

Merge base: `a936dee7b1ea2f0ac6ec2fb698dd815279d1054f`

Worktree:
`/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719`

This receipt changes no product code, schema, data, query, provider,
configuration, integration, deployment, session, or production target.
Production data was not queried.

## 1. Verdict

P05 remains irreducible MVP and security core. The staged end-state is
directionally correct, and its public route, cookie, bridge, and browser
response contracts can remain compatible. It is **not safe to port
unchanged**.

Final classification:

| Concern | Result |
| --- | --- |
| requirement | `KEEP (MVP core)` |
| source basis | favorable; P05 began over auth source equivalent to current production |
| public API and cached first-party clients | compatible if the backend leads and existing names/shapes remain |
| schema/data | breaking final state; use `EXPAND-MIGRATE-OBSERVE-CONTRACT` |
| staged implementation | `REWORK`; semantic rebuild, not merge/cherry-pick |
| production data | PC4 gate required |
| rollback | reversible only before contraction; roll forward after contraction |

The blocking defect is cached-cookie continuity. Production can accept a
browser cookie that names an ancestor in a replacement chain. The staged
migration hashes the canonical leaf and deletes predecessor/replacement rows.
If an earlier refresh committed but its response or `Set-Cookie` was lost, that
browser can still hold a valid ancestor credential that cannot be discovered
from database state. The staged migration can therefore sign out a cached
client even though one leaf-session browser acceptance passed.

## 2. Irreducible system

The authenticated continuity system has five authorities:

1. WorkOS/Convex verified JWT identity owns `authSubject`.
2. `users.by_authSubject` maps that subject to one Polynet account.
3. Convex owns the durable server session and encrypted provider token state.
4. The browser owns one HttpOnly opaque session cookie and holds only
   short-lived bearer tokens in memory.
5. Same-origin Vercel `/api/auth/*` routes bridge the browser to the private
   Convex auth HTTP routes.

The minimum causal flow is:

```text
provider identity
  -> verified authSubject
  -> one users row
  -> one durable Convex session
  -> one opaque HttpOnly browser cookie
  -> short-lived browser bearer
  -> per-request entitlement/access checks
```

This is server-owned durable continuity with browser-held ephemeral bearer
state. It is not a generic workflow engine and does not need a full
backend-for-frontend architecture.

## 3. Isolated staged change

P05's source baseline is
`1c3fad3618d75833b923a3d467798e2a64bed1f8`. The final P05 hardening commit is
`66cc5f5a`. The baseline auth paths are byte-equivalent to current production
except for an unrelated schema addition, so the staged work is a useful
production-relative design experiment.

The P05 commit sequence is:

- `a42ee63a` secure session identifiers;
- `0bc68645` recoverable, local-authoritative logout;
- `a3906110` subject-authoritative actor provisioning;
- `b03b7eac` stable session continuity;
- `382dcb40` refresh subject-drift containment;
- `7523599f` self-draining terminal retention;
- `5e0c763f` temporary retention backfill;
- `96b1f108` removal of that backfill;
- `d945ac5b` malformed-cookie recovery;
- `3dbf8818` provider response deadlines;
- `66cc5f5a` Vercel bridge response deadlines;
- five evidence-only acceptance/receipt commits.

Membership work is interleaved in the historical range. The future candidate
must therefore rebuild P05 semantically from then-current `origin/main`.

Across the 13 focused P05 runtime/bridge/schema/script files, the staged range
is 858 additions and 1,106 deletions, a net reduction of 248 lines. Three
focused behavioral test files add 1,915 lines. The broader historical diff also
contains unrelated membership, email, diagnostics, styling, and voice changes;
none belongs in a P05 port merely because it shares the range.

## 4. Production and staged state models

### Current production

`authSessions` stores:

- required raw `sessionId`;
- required `authSubject`;
- optional `userId` and `replacedBySessionId`;
- encrypted provider secret and profile snapshot;
- optional access-token expiry;
- refresh/revocation/create/update timestamps;
- indexes by raw session id, auth subject, and user.

Refresh creates a new row and revokes/replaces the previous row. Lookup may
follow a replacement chain up to depth eight. A secret-protected public
maintenance mutation and `scripts/auth_prune_sessions.sh` perform bounded
deletion after an initial full-table collection.

### Staged end-state

`authSessions` stores:

- required SHA-256 `sessionTokenHash`, never the raw browser credential;
- optional `userId`;
- encrypted provider secret;
- required absolute `expiresAt`;
- optional 30-second refresh lease;
- required `secretRevision`;
- optional `revokedAt` and indexed `purgeAfterAt`;
- create/update timestamps.

Each sign-in uses `crypto.randomUUID()`. Refresh updates the same row under a
lease and revision check. Lifetime is 30 days from sign-in rather than sliding.
Revoked or expired rows self-drain through an internal bounded hourly cron.

The staged state model deletes raw credential storage, refresh-row
proliferation, replacement-chain resolution, auth-subject duplication on the
session row, and the operator-run full-collection prune path. Those are the
correct final deletions, but only after compatibility observation.

## 5. Public and cached-client compatibility

The staged design preserves:

- `/api/auth/google/start`;
- `/api/auth/google/callback`;
- `/api/auth/session`;
- `/api/auth/refresh`;
- `/api/auth/logout`;
- the four existing `/runtime/auth_bridge_session_*` paths;
- `__Secure-arx-auth-session` and the local `arx-auth-session` cookie;
- cookie path, HttpOnly, Secure, and SameSite=Lax behavior;
- `access_token`, optional `id_token`, `expires_at`, and `user` response fields;
- the rule that the browser never receives a provider refresh token.

Compatibility direction matters:

| Order | Result |
| --- | --- |
| new backend, old web/API | compatible; old callers tolerate an omitted `session_id` |
| new backend, then new web/API | desired |
| new web/API, old backend | unsafe trajectory; ignored rotation can keep growing replacement chains |
| UI-only contraction | insufficient; authority remains in the backend |

`auth:bootstrapActor` no longer returns the old `continuity` projection. All
found first-party consumers use actor identity, tier, and profile fields and
map a missing continuity field safely. Unknown external callers of the public
Convex function remain an explicit external-consumer unknown.

The ARX-named cookie/env variables and `google` route names are legacy
branding, but changing them creates compatibility cost without improving the
MVP. Keep them.

## 6. Required migration trajectory

The safe migration is:

1. **Expand.** Make new fields/indexes optional while retaining old fields and
   indexes. Deploy only bounded internal migration helpers.
2. **Migrate.** Populate canonical leaf rows, but retain raw legacy credentials,
   replacement rows, and `by_sessionId`.
3. **Dual-read.** Hash lookup first. On a miss, resolve the old raw
   `sessionId` chain, return the canonical leaf credential as `session_id`, and
   record only bounded aggregate fallback-hit evidence.
4. **Backend cutover.** Deploy the compatible backend before the Vercel/web
   hardening.
5. **Web cutover.** Preserve the existing behavior that sets a returned
   `session_id`, so an ancestor-cookie browser converges to the leaf.
6. **Observe.** Wait at least the maximum historical cookie lifetime after the
   last old-backend deployment and require zero legacy fallback hits.
7. **Contract.** Remove raw credentials, replacement fields/indexes, chain
   resolver, email relink/indexes, manual prune mutation/script, and temporary
   migration code.

The compatibility reader is temporary. Do not add a permanent alias table,
session workflow engine, queue, retry engine, or migration framework.

The actual historical maximum cookie lifetime and configured cookie domain are
PC4 evidence gates. The current default of 30 days is not enough evidence if a
production override ever extended it.

## 7. Security, robustness, and drift findings

### Required corrections

1. `getUserByResolvedSubject` uses indexed `.first()`. Existing duplicate
   `authSubject` corruption could silently select an account.
2. `getAuthSessionRowByLookup` also uses `.first()`. Existing duplicate hashes
   could silently select a session.
3. The future candidate must fail closed with `.unique()` or a bounded
   two-row check. PC4 must first prove current duplicate counts.
4. Browser-to-Vercel fetch lacks an application deadline. Add one canonical
   outer deadline greater than the 15-second bridge deadline and below the
   25-second route limit; do not add retry orchestration.
5. `auth.session_established` is durably written on ordinary success, while
   `platformDiagnostics` has no demonstrated retention owner. Do not port
   routine bootstrap-success writes. Retain only security/failure evidence.
6. Optional parent-domain cookie support can create subdomain and
   duplicate-cookie ambiguity. Determine the production configuration. If no
   cross-subdomain requirement exists, contract toward host-only cookies only
   after the compatibility window.

### Document drift

`docs/auth-session-target-architecture-v1.md` contradicts both itself and live
code: it describes AuthKit browser ownership and says the bridge was removed,
then later presents the active bridge/server-continuity model as a future
target. Current routes, environment guards, controller code, and
`docs/auth-runtime-setup-workos-authkit.md` prove that the same-origin bridge is
active and durable continuity is already server-owned.

The target document has idiot index 10. Replace it with one compact current
contract, or archive/delete it after reconciliation. Do not preserve false
history as operational guidance.

### Explicit non-requirements

- Sign-in session creation is not idempotent, so a lost callback response can
  leave an inaccessible row. Absolute expiry plus indexed retention bounds the
  residue. Do not build a receipt/queue unless production evidence makes this
  material.
- The same bridge secret signs flow state and authenticates Vercel-to-Convex.
  No separate secret is required by current evidence.
- Current SameSite and server-to-server constraints do not justify more Origin
  machinery without a demonstrated threat.

## 8. Elon reduction ledger

| Surface | Idiot index | Decision |
| --- | ---: | --- |
| verified subject, server continuity, opaque hashed credential | 0 | keep |
| absolute expiry, lease/revision, indexed retention, bounded calls | 1 | keep |
| email relink and full-user scan | 10 | delete |
| per-refresh rows and replacement chains | 10 | delete after observation |
| raw session credentials | 10 | delete after observation |
| public/manual production prune and full collection | 10 | delete after cron is live |
| routine successful-bootstrap diagnostic rows | 9 | delete |
| contradictory target-architecture document | 10 | replace/delete |
| generic workflow, queue, retry, or receipt engine | 10 | do not add |
| permanent credential-alias table | 9 | do not add |
| branding-only cookie/env/route rename | 8 | do not do |
| sign-in idempotency receipt | 8 | defer unless measured |

## 9. PC4 production evidence gates

Use bounded counts/distributions only. Return no tokens, session credentials,
private content, email addresses, or user identifiers.

Required evidence:

- duplicate and missing `users.authSubject` counts;
- total, active, revoked, replacement, and terminal session counts;
- duplicate raw session-id count;
- replacement-chain cycles, maximum depth, and terminal-leaf distribution;
- age, expiry, secret-version, and malformed-lifecycle distributions;
- number of rows directly migratable versus requiring compatibility handling;
- non-secret cookie-domain and historical max-age configuration;
- last old-backend deployment time;
- auth diagnostic cardinality and age distribution;
- external consumers of changed public Convex projections, if discoverable.

Staging evidence processed more than 60,000 legacy rows and ended with 1,069
canonical rows with valid hashes, revisions, lifetimes, and retention
timestamps. That proves staging mechanics only. It neither represents
production shape nor proves ancestor-cookie continuity.

## 10. Rollback boundary

Before contraction, rollback is possible only if legacy fields/indexes remain
readable and compatibility writes remain sufficient for the old code.

After raw `sessionId`, `authSubject`, email lookup indexes, and replacement
state are removed:

- old code cannot read hashed-only session rows;
- old actor provisioning cannot rely on deleted indexes;
- schema rollback can fail deployment or sign users out;
- rollback is therefore forbidden.

After contraction, recover by rolling forward to the last known fail-closed
backend. A Vercel rollback after the new backend remains data-compatible but
loses hardened timeouts and confirmed local-authoritative logout.

## 11. Focused proof

The current staged end-state passed:

- `test:auth-actor-subject-authority`: 4/4;
- `test:auth-session-security`: 37/37;
- `test:auth-session-state-machine`: 15/15;
- auth environment, verified-identity, public-bootstrap, billing-identity,
  no-legacy-import, diagnostics-contract, and gate-parity guards.

Total focused behavioral result: 56/56.

Proof still missing:

- a fixture for already-corrupt duplicate subject/hash rows;
- lost rotation response plus ancestor-cookie migration continuity;
- the temporary dual-read and observation window;
- browser-to-Vercel timeout behavior;
- cookie-domain/duplicate-cookie behavior;
- bounded production shape.

## 12. Minimal future release units

If PC4-PC6 retain P05, the smallest honest units are:

1. subject-authority reduction plus duplicate fail-closed reads, while keeping
   legacy indexes through rollback;
2. session-schema expansion, bounded migration, and temporary dual-read;
3. backend cutover to hashed stable sessions, absolute expiry, subject drift
   checks, leases, retention, and deadlines;
4. Vercel/web malformed-cookie, confirmed-logout, and outer-deadline hardening;
5. full observation window followed by legacy schema, chain, operator script,
   success-diagnostic, and stale-document contraction.

No unit may merge the long-lived staging branch, port unrelated historical
diffs, query or mutate production without separate authorization, or deploy
before PC6 and explicit human approval.

## 13. Next slice

PC3C is complete as a read-only compatibility map. It does not authorize a P05
implementation or production-data query.

The next bounded slice is `PC3D`: map P06 membership and community-access
source/API/schema/cached-client/rollback compatibility. That preserves the
dependency order:

```text
auth -> membership -> entitlement -> admission -> money
```

## 14. Subsequent checkpoint

PC3D is complete in
`pc3d-membership-community-access-compatibility-20260724.md`. P06 remains core,
but its staging implementation must be rebuilt through
`EXPAND-MIGRATE-OBSERVE-CONTRACT` and reduced further before it can meet the
8/10 target. PC3E is next for P07 account-tier/entitlement compatibility. This
later checkpoint does not alter the PC3C evidence or verdict above.
