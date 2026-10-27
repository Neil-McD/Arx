# Slice 4A1: truthful memory consumption and outcome receipts

**Bounded staging acceptance passed October 15, 2026. Production was untouched.**

[Structured evidence](evidence/2026-10-15-staging-memory-consumption-4a1.json).
[Approved scope](../archive/polynet-staging-memory-consumption-4a1.md).
[Draft PR #177](https://github.com/Neil-McD/Arx/pull/177), stacked on #176.

## Release identity

| Boundary | Verified evidence |
| --- | --- |
| Clean runtime / Git staging / served staging | `ac49ad2f8308b1ffec20dcc622fe6c332aad7a4b` |
| Backend | Explicit `convex dev --once --typecheck enable --env-file /tmp/polynet-package-1-staging.env`, exit 0; `dev:quick-porcupine-949` |
| Backend source tree | `1f15d41b0ccbc04091ba1fca0f92da65cebb0c6b`; clean local deployment provenance, not remote commit attestation |
| Web | Successful [Git staging deployment](https://polynet-staging-pqm20ids4-neil-mcds-projects.vercel.app), deployment `7103152932` |
| Serving asset | `/assets/index-pqBy0i6E.js`; SHA-256 `27520efba35648594b1a864bb060336bb783d3e151ed8845c65c98605543e5a0`; both staging Convex hosts embedded |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4`, unchanged |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |

Staging was pushed before the feature branch. Both staging layers were verified
before the native consumption/outcome proof. No production release command or
provider setting change was used. Feature-branch deployment checks are separate
from the production alias. Receipt-only commits are separate from the deployed
runtime and its [passing CI run](https://github.com/Neil-McD/Arx/actions/runs/38799577972).

## Implementation and local verification

The old memory adapter accepted any returned object as success, including the
directory owner's explicit `{ok:false}` refusals. It then stored a completed
successful operation receipt even though no outcome existed.

- Added one operation-specific acknowledgment check. A domain refusal becomes a
  canonical error; a malformed response without a successful, consistent outcome
  identity and deduplication state is also an error. Failed attempts do not get
  completed success receipts.
- Cached completed values receive the same check. Historical nested refusals
  return errors without rewriting their audit records. Successful historical
  acknowledgments retain the existing recovery shape.
- Kept all five tools, version 1 of `community.memory.record_outcome`, and current
  domain owners/stores. Existing per-consumption/node deduplication handles an
  uncertain gap between domain commit and canonical receipt completion.
- Reconciled the active lineage contract's stale read-only publishing and live
  AI Feed claims. Historical certificates were preserved as historical evidence.
  Documented separate search/read receipts and observed-versus-accepted outcomes.

**245 tests / five affected files passed.** Twenty-nine new memory tests use a
real current interaction -> trace -> deterministic digest -> governed synthetic
retention/citation fixture. No model is invoked. Coverage includes explicit and
malformed refusals, cached historical refusals, actor/community/surface/version/
injection/linkage controls, changed/new keys, concurrent reports, uncertain
receipt completion, current access loss and draft/private/admin/foreign/revoked/
superseded evidence reads. Both ordinary-member and founder external reads use
the member visibility boundary. The existing crash-recovery proof also passes.

The exact clean-candidate release gate passed all 15 steps: **1,865 tests /
194 files**, both typechecks, web build/bundle and browser foundation proof,
semantic/canonical/memory/citation/lineage/identity checks and both dependency
audits zero. Local behavioral tests, source-pattern checks, remote CI and actual
native proof are distinct evidence classes.

## Live proof

Reused the approved `workflow-cursor-20260907` fixture and its existing retained
memory. Fresh native OAuth verified the distinct actual founder and ordinary
member identities. Protected member self-context and founder directory reads
confirmed current access/management. Before the proof: zero outcome observations,
zero memory retrieval logs, no 4A1 operation receipts, and one historical applied
memory-creation request. Original full bounded snapshot SHA-256:
`ace37c7f8e8c4c5a068de7ab1b238747aae22f25fe22805690fb22adcbb2f128`.

The retained node was already `promising`, version 1, `compiler_memory` and
`citation_v1`. Its compiled trace, retain decision/work key, immutable citation,
applied request and live human source refer to the same canonical evidence.
This proof consumed existing intelligence; it did not create a new compiler run.

| Step | Observed result |
| --- | --- |
| Native member memory search | Same accepted node and citation returned; actor-owned search receipt, returned but not injected |
| Native exact memory read | Same node/body/grade/citation; separate actor-owned receipt, returned and injected |
| Exact cited source read | Existing channel repository returned the same live human interaction reference |
| Native founder exact read | Separate founder-owned receipt; external projection still uses member visibility |
| Search-only report | MCP error `community_intelligence_retrieval_node_not_injected`; failed operation receipt, zero outcomes |
| Member using founder receipt | MCP error `community_intelligence_retrieval_log_forbidden`; failed operation receipt, zero outcomes |
| First valid report | Exact envelope persisted before dispatch; first application acknowledgment discarded |
| Independent observation | One member-owned synthetic `worked` observation, one read-receipt linkage, one pending `attach_outcome` request, one completed operation receipt |
| Normal owner side effect | `memoryMetabolismPending: true`, revision 1; no requested metabolism/application |
| Full process restart | Member PID `46723` exited 0; fresh PID `60862` recovered with native stored OAuth credentials |
| Same saved envelope | Original observation returned with outer `deduped: true`; full bounded snapshot identical |
| Same key / changed notes | `idempotency_key_conflict` |
| New key / same episode and payload | Same observation, domain `deduplicated: true`; second completed operation receipt allowed |
| New key / changed status | MCP error `community_memory_outcome_conflict`; failed operation receipt |
| Final canonical count | One observation, one pending request; two completed operation receipts and three failed denial/conflict receipts |

The saved envelope SHA-256 is
`4b137c176f27ee0cb4f919795b5572744ae5b429b76f4db6ecbc8a844a22dd3e`.
The exact replay preserves the original inner acknowledgment, whose
`deduplicated: false` describes its first domain execution. Outer `deduped: true`
identifies canonical receipt replay. A new-key retry runs the owner again and
returns inner `deduplicated: true` without another domain effect.

| Canonical record | Retained ID |
| --- | --- |
| Community | `jx76tshcgsbe3bqt0rdytkayh98e1f57` |
| Member membership / activation | `ks78mj4ga2kanz4ddxdw5etf7n8e0ymg` / 1 |
| Accepted node | `w97fphdpn87dx9g1rcapq39mgd8e67f4` |
| Source interaction | `j97vwfz8cq0tcd3kg0wv0zq7358e0m5j` |
| Source trace / citation | `wn787khs51xkkemn97nb88sd4s8e0xd3` / `n97kwsh75acre6p32gb1ajzmw58e6zae` |
| Member search receipt | `wd7de8c6g1k93f6r0a4qk994zh8gbpak` |
| Member exact-read receipt | `wd773gsh8xzegbffpm5xc92x7x8ga2vr` |
| Founder exact-read receipt | `wd76zhyn0zmpnq7m9hyxkvegfh8gb5t1` |
| Synthetic outcome | `wh7cvs77gj4j991312g5y53q0h8gbbh0` |
| Pending attach-outcome request | `x17fp8vy7wbashmq730570s5098gaywb` |
| Initial completed operation receipt | `ps7tf13v732m3c3kcthrf4gq4h8gbfyk` |

The report's notes explicitly identify a synthetic diagnostic-consumption test
and disclaim any customer result, model use or validation of business advice.
Its evidence strength remains **observed**, and application remains pending.
“Injected” proves content was returned to the client; no model-use claim is made.
The acknowledgment was discarded after transport completion. Independent commit
observation and a full process restart prove bounded application recovery, not a
forced network outage or general crash recovery.

## Preservation and cleanup

- Accepted node/body/status/version, trace, immutable citation, source and content
  blocks remained exactly unchanged. Historical workflow revision 3, states,
  runs, transitions, membership and roster also matched the original snapshot.
- 3A1, 3A2 and retained 2A/2C1/2C3/2C4 before/after snapshots matched exactly.
  The revoked membership stayed inactive and the October 22 denial/reapplication
  deadline, contribution, audit and outbox history were preserved.
- No requested inference, compiler cycle, metabolizer invocation, memory/source
  edit, membership mutation, workflow transition, payment or provider setup.
  A bounded fixture observation since 20:00 UTC found zero new agent runs or
  community-agent serve requests. No accepted-memory promotion occurred.
- Retained all synthetic observations, pending requests, retrieval records and
  operation receipts. No fixture reset, raw deletion or historical receipt rewrite.
- Ended proof processes, removed both isolated native OAuth credentials, and
  verified fresh clients were `notLoggedIn` with protected reads requiring auth.
  Every process exited 0. Permanent Codex configuration SHA-256 stayed
  `0041dd6497be4f8aacd06e5a83fed2750713a9e20cb4160cd362b61146abbfc2`.
- Closed the two owned OAuth tabs. No Polynet web product session was used.
  Local credential removal does not claim provider-wide grant revocation or
  old-token invalidation.

4A1 proves truthful current consumption and one observed report/recovery episode.
Fresh current-source compilation and later outcome application/usefulness remain
separate planned slices; neither is inferred from this synthetic `worked` report.
