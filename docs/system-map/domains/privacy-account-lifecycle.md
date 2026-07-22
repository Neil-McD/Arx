# Domain Dossier — Privacy and Destructive Lifecycle

## Irreducible job

Let a person control their account and private data without corrupting money records, audit duties, community-owned knowledge, or another person's records. Account and community deletion must be explicit, resumable, idempotent, observable, and ownership-aware.

## State and ownership classes

| Class | Examples | Deletion rule needed |
| --- | --- | --- |
| user-private | sessions, provider credentials, profile details, personal memory, preferences | delete or cryptographically sever |
| shared interpersonal | DM conversation/messages, reactions, mentions | preserve other participants' history while redacting departing identity/content per policy |
| community-contributed | resources, events, interactions, evidence, accepted intelligence | community owns continuity; remove private attribution or purge content only under explicit policy |
| financial/legal | ledger, commissions, payouts, provider receipts, legal acceptance | immutable/minimally retained with identity scrubbing and retention basis |
| operational evidence | audit/diagnostic/runtime receipts | bounded retention and pseudonymization; never accidental authority |
| external-provider state | OAuth, Stripe, worker/provider resources | revoke/delete externally and reconcile local state with receipts |

The ownership matrix is accepted as product direction. `accountLifecyclePolicy.ts` now encodes declarative coverage for all 127 current schema tables and 121 direct user-reference edges, but the bounded executor and exact legal/financial/security TTLs remain open.

## Account deletion path

`convex/account.ts` now exposes only an authenticated quarantine. It resolves an existing verified actor without provisioning, then throws `account_delete_lifecycle_migration_blocked`. The first-party deletion form, callback, and cloud gateway are gone, so current and stale clients cannot run the retired executor.

The removed executor established two requirements for its eventual replacement:

1. For every conversation in which the deleting user was a participant, the retired mutation deleted **all** messages, **all** participant rows, typing rows, and the conversation. That erased the surviving participant's shared history. `dmParticipants.status` supports `left`, yet no ordinary leave/delete-conversation operation was found.
2. It deleted community resources and events solely because the user created them. This treated creator attribution as ownership of shared community objects and could destroy community value after contribution.

The retired mutation touched legacy `communityChatMessages` but not canonical interaction roots/replies. The schema declares moderation events `privacy_purge_requested` and `privacy_purged`, while no first-party privacy purge workflow was found. That is an unfinished replacement lifecycle, not a safe retention policy.

The generated policy names every table and its contract proof owns the current coverage counts. Some direct user-reference edges still require bounded indexes, while other rows correctly require retention; coverage vocabulary is not yet execution or behavioral proof.

C2.1 adds only the durable safety substrate: one account-specific checkpoint plus append-only transition receipts. Authenticated internal request creation moves to `requested`; an indexed preflight can move only to `blocked`. It records stable policy-versioned blocker codes and supports idempotent replay and interruption/resumption, but it cannot freeze access, delete or patch product data, schedule work, call providers or storage, finalize a root, or become publicly callable. The public deletion mutation remains quarantined.

The replacement policy still needs an explicit rule for DM attachments embedded in `contentJson`. The retired executor did not visibly clean their storage objects; this remains a historical storage-leak inference until attachment representation and live prevalence are checked.

## Community deletion path

`deleteCommunity` is now a zero-effect quarantine. It resolves the verified actor and current owner, then throws `community_delete_lifecycle_migration_blocked`. It performs no collect, delete, provider call, or schedule; repeated calls are inert. The first-party gateway/controller/modal/action is removed and owner settings expose static paused copy. The prior unbounded cascade is deleted, while the bounded internal cognition drain remains for already-scheduled historical cleanup.

The correct primitive is a deletion state machine:

```text
request -> block new writes -> inventory by ownership policy -> external revoke
-> bounded local phases -> privacy scrub/retention tombstone -> invariant audit
-> terminal receipt -> remove root identity last
```

## Anonymous-user cleanup

The generic cleanup executor and its audit script are deleted. They had no runtime caller or scheduled invocation, originated as a one-time migration, and treated absence from a manually maintained 55-edge reference list as permission to hard-delete a user root even though the current schema contains 121 direct user-reference edges.

The 56 development rows remain unchanged. No active creator path exists in current source, but their reference state and final disposition remain U-013. Any eventual data change requires a schema-derived, redacted, expectation-locked migration or the completed account lifecycle; there is no retained generic deletion capability.

## Complexity and failure posture

| Path | Current order/failure | Required shape |
| --- | --- | --- |
| account deletion | public path quarantined; internal metadata-only request/preflight is resumable and can only become blocked | bounded phases with retry and terminal audit |
| DM cleanup | retired destructive executor cannot run; replacement semantics absent | participant departure plus policy-driven redaction |
| community deletion | quarantined after verified owner resolution; zero writes/schedules | community-keyed inventory, cursor, tombstone, finalizer |
| anonymous roots | generic executor removed; 56 development roots remain | schema-derived evidence, then explicit migration or account lifecycle |
| audit/diagnostic retention | unbounded growth; deletion policy not found | time/need-based retention with preserved minimal receipts |

## Reduction candidates

| Candidate | Classification | Action | Idiot index | Rationale |
| --- | --- | --- | ---: | --- |
| account/community deletion capability | `KEEP (MVP core)` | `HARDEN`, `BOUND` | 1 | legally and operationally required; safely unavailable until rebuilt |
| one-transaction cross-domain deletion | `DELETE (deferred/dead)` complete | `DELETE` | 10 | both destructive executors are quarantined and their first-party action paths are gone |
| delete every DM when one participant deletes an account | `DELETE (deferred/dead)` complete | replacement `HARDEN` | 10 | the retired behavior violated shared ownership; replacement semantics remain open |
| delete community resources/events by contributor ID | `DELETE (deferred/dead)` complete | replacement `HARDEN` | 9 | quarantine preserves community continuity until anonymization exists |
| privacy purge event states without an implemented workflow | `KEEP (MVP core)` | `HARDEN`, `MIGRATE_THEN_DELETE` | 8 | accepted policy requires propagation; state vocabulary alone is false assurance |
| anonymous-user cleanup hard-coded scans | `DELETE (deferred/dead)` complete | data decision remains U-013 | 9 | unowned migration machinery cannot safely infer root deletion from an incomplete reference list |

## Proof required before any destructive change

A synthetic fixture must include private records, a DM with a surviving user, community-contributed content, canonical interactions, provider credentials, storage attachments, unresolved/settled finance, audit history, and an interrupted deletion. The proof must demonstrate retry, other-party preservation, required anonymization, external revocation receipts, orphan-free completion, and root deletion last.
