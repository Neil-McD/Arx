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

The ownership matrix is now accepted as product direction. The current implementation does not encode it as one lifecycle contract, and exact legal/financial/security TTLs remain open.

## Account deletion path

`convex/account.ts:349-673` implements `deleteOwnAccount` as one large mutation. It checks finance and mounted-object blockers, then collects and deletes rows across many domains. The broad intent is good, but the operation is transaction-sized, non-resumable, and incomplete relative to 125 tables.

Two source-level defects are upstream of all cleanup aesthetics:

1. For every conversation in which the deleting user is a participant, the mutation deletes **all** messages, **all** participant rows, typing rows, and the conversation (`account.ts:597-649`). That erases the surviving participant's shared history. `dmParticipants.status` supports `left`, yet no ordinary leave/delete-conversation operation was found.
2. It deletes community resources and events solely because the user created them (`account.ts:435-436`). This treats creator attribution as ownership of shared community objects and can destroy community value after contribution.

The mutation deletes legacy `communityChatMessages` sent by the user, but no canonical interaction roots/replies are included. The schema declares moderation events `privacy_purge_requested` and `privacy_purged` (`schema.ts:2003-2004`), while the interaction core emits ordinary edit/tombstone events and no first-party privacy purge workflow was found. That is an unfinished lifecycle, not a safe retention policy.

Static comparison also found user-linked state with no explicit account-deletion edge, including member facts/profile spines, legal acceptances, some source/app OAuth state, workspace settings/snapshots, auto-recharge/customer/runtime lease state, and canonical interaction/evidence attribution. Some rows may correctly require retention; the defect is the lack of a named policy and proof.

DM attachments embedded in `contentJson` are not explicitly storage-cleaned when messages are deleted. This is a storage-leak inference until attachment representation and live prevalence are checked.

## Community deletion path

`deleteCommunity` performs wide per-table collects, a global checkout-session scan, and nested thread/message/reaction deletes in one mutation, then schedules cognition cleanup after the community row is removed. Complexity grows with global checkout history plus all community-owned state. It lacks a durable phase/cursor/receipt from which to resume.

The correct primitive is a deletion state machine:

```text
request -> block new writes -> inventory by ownership policy -> external revoke
-> bounded local phases -> privacy scrub/retention tombstone -> invariant audit
-> terminal receipt -> remove root identity last
```

## Anonymous-user cleanup

`convex/anonymousUserCleanup.ts` identifies accounts whose subject begins `anon:`. Its internal cleanup scans users and repeatedly full-scans a hard-coded list of referencing tables to decide safety. No scheduled or first-party runtime owner was found in the static snapshot. The reference list is necessarily fragile as tables evolve; absence from the list is not proof of safe deletion.

This looks like legacy/manual maintenance residue. Before deletion, count anonymous rows, identify their creation path, compare every user foreign-key field against the cleanup list, and decide whether the accounts should be migrated, expired, or retained.

## Complexity and failure posture

| Path | Current order/failure | Required shape |
| --- | --- | --- |
| account deletion | `O(all owned/shared history)` in one mutation; partial external effects have no phase receipt | bounded phases with retry and terminal audit |
| DM cleanup | `O(all messages and participants in every joined conversation)` and destroys other-party state | participant departure plus policy-driven redaction |
| community deletion | `O(global checkout sessions + all community rows)` in one mutation | community-keyed inventory, cursor, tombstone, finalizer |
| anonymous cleanup | `O(users × scanned reference tables)` with incomplete static foreign-key list | indexed lifecycle state or explicit one-time migration |
| audit/diagnostic retention | unbounded growth; deletion policy not found | time/need-based retention with preserved minimal receipts |

## Reduction candidates

| Candidate | Classification | Action | Idiot index | Rationale |
| --- | --- | --- | ---: | --- |
| account/community deletion capability | `KEEP (MVP core)` | `HARDEN`, `BOUND` | 1 | legally and operationally required; current algorithm is not |
| one-transaction cross-domain deletion | `KEEP (MVP core)` | `MIGRATE_THEN_DELETE` | 10 | irreversible work should not depend on one unbounded transaction |
| delete every DM when one participant deletes an account | `KEEP (MVP core)` | `HARDEN` | 10 | violates shared ownership and destroys another user's data |
| delete community resources/events by contributor ID | `KEEP (MVP core)` | `HARDEN`, `OBSERVE_FIRST` | 9 | accepted policy preserves community continuity and anonymizes the contributor |
| privacy purge event states without an implemented workflow | `KEEP (MVP core)` | `HARDEN`, `MIGRATE_THEN_DELETE` | 8 | accepted policy requires propagation; state vocabulary alone is false assurance |
| anonymous-user cleanup hard-coded scans | `DECISION REQUIRED (user confirmation)` | `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | 8 | likely residue, but live anonymous accounts and creators are unknown |

## Proof required before any destructive change

A synthetic fixture must include private records, a DM with a surviving user, community-contributed content, canonical interactions, provider credentials, storage attachments, unresolved/settled finance, audit history, and an interrupted deletion. The proof must demonstrate retry, other-party preservation, required anonymization, external revocation receipts, orphan-free completion, and root deletion last.
