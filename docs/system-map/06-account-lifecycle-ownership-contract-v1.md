# Account Lifecycle Ownership Contract v1

Status: planning authority only. Runtime deletion remains quarantined.

Current policy version: `account-lifecycle-v3`

Code authority: `convex/accountLifecyclePolicy.ts`

Drift proof: `scripts/account_lifecycle_policy_contract_proof.ts`

Historical containment baseline: commit `6e603244b6a28892494e8949655419e1e17ad391`

## Irreducible job

Delete one person's private account state without deleting another person's history, corrupting community-owned value, erasing required financial/legal evidence, leaking provider credentials, orphaning storage, or allowing purged information to reappear through derived intelligence.

Account deletion is not authored-content deletion. The first severs an identity and private state. The second is a separate explicit privacy operation that may remove content and must propagate through archives, evidence, retrieval, and intelligence.

## C2 lifecycle boundaries

C2 contains three different destructive lifecycles:

1. **Account identity deletion** severs one person's account and private state while preserving shared and community-owned continuity.
2. **Authored-content privacy purge** removes selected content and propagates the purge through archives, evidence, retrieval, and derived intelligence without implicitly deleting the account.
3. **Community deletion** removes community-owned state while reconciling access, billing, providers, storage, and retained evidence under a separate community ownership policy.

They may share small checkpoint and receipt mechanics. They must not share ownership semantics or collapse into one generic deletion executor.

## Non-negotiable invariants

1. Account deletion stays fail-closed until every executor satisfies this contract.
2. Verified identity and current authority are resolved before a lifecycle request is accepted.
3. New sessions and new privileged effects freeze before destructive phases.
4. Owned communities, developer apps, and skill packages are transferred or explicitly removed first.
5. Shared DM sequence and content survive for remaining participants unless separately purged.
6. Community-owned resources, events, interactions, and accepted contributions survive contributor departure.
7. Provider and storage effects are idempotent, retryable, and receipted.
8. Financial, legal, security, and operational evidence is minimized under a named retention authority; it is never silently preserved forever.
9. Privacy purge propagates through every derived retrieval surface.
10. Work is bounded by indexed pages or a declared bounded parent cascade.
11. The account root is finalized last, after an orphan and invariant audit.
12. A terminal receipt cannot claim success unless all required phases and external effects are proven complete.

## Schema coverage authority

`convex/accountLifecyclePolicy.ts` and `scripts/account_lifecycle_policy_contract_proof.ts` are the only current schema-count authority. Narrative documents must not maintain a second manual registry.

At the 2026-07-22 C2 truth-closure receipt, the proof covers 125 schema tables, 120 direct user-ID fields, 26 opaque fields, and seven storage-ID fields. It identifies 40 direct edges without a user-first index: 33 require a new bounded index and seven use a declared bounded parent cascade.

The remaining tables are still classified because they may be connected indirectly through a community, conversation, app, resource, thread, run, evidence record, or parent object.

Adding a schema table, direct user edge, opaque field, or storage field must fail the contract proof until the policy version is deliberately reviewed.

## Ownership classes and default disposition

| Ownership class | Default disposition | Authority after deletion |
| --- | --- | --- |
| root identity | `root_last` | terminal lifecycle receipt or irreversible tombstone |
| account-private | `hard_delete` | none |
| shared interpersonal | `participant_departure` or `detach_identity` | remaining participants |
| community-owned | `detach_identity`, `transfer_or_block`, or `parent_managed` | community owner/admin authority |
| financial/legal | `retain_minimal` | finance/legal owner |
| operational evidence | `retain_minimal` with TTL | security/operations owner |
| external provider | revoke/release, then delete local private state | provider contract and effect receipt |
| derived intelligence | `privacy_propagate` | community intelligence policy |

The executable detail is field-aware. For example, `communities.ownerId` blocks finalization until transfer. The deprecated nested `communities.memberOnboarding.updatedByUserId` never created ownership and its zero-row staging field-removal migration is complete.

## Disposition semantics

### `hard_delete`

Delete the account-private row in bounded, retryable pages. If it owns private storage, delete the storage object idempotently before marking the row complete. Required finance/audit receipts live in separate retained tables rather than keeping private payloads “just in case.”

### `participant_departure`

Revoke access and record departure without destroying the shared container. For DMs, the participant becomes non-active and no longer resolves to the deleted account. Other participants retain ordered conversation history.

### `detach_identity`

Preserve the shared/community object while removing resolvable account attribution. User-facing projection renders an explicit deleted-member tombstone. Do not create a universal synthetic deleted-user account; that would collapse unrelated identities and preserve correlation.

### `transfer_or_block`

The lifecycle request cannot proceed while the account remains the authority owner. Transfer is explicit, authorized, and receipted. Automatic reassignment to an arbitrary admin is forbidden.

### `retain_minimal`

Keep only fields required for accounting, tax, fraud, dispute, legal, or security duties. Replace the product user reference with a retention-scoped subject key that cannot grant product access. Exact TTL and legal basis must be supplied by the named authority before execution.

### `privacy_propagate`

Remove or invalidate private/raw evidence, then trace every dependent archive, citation, accepted-intelligence node, edge, digest, retrieval index, and outcome. Derived intelligence may remain only when independently supported; otherwise it becomes stale/deprecated and leaves retrieval.

### `parent_managed`

The row has no independent account lifecycle. Its canonical parent determines preservation, transfer, purge, or deletion. This is not permission to scan or ignore the row.

### `root_last`

Delete or irreversibly tombstone the product identity only after every phase receipt, provider effect, orphan check, and retained-subject conversion succeeds.

## Required lifecycle phases

```text
request
-> access_freeze
-> preflight_blockers
-> external_revoke
-> private_delete
-> shared_anonymize
-> privacy_propagation
-> retained_evidence
-> invariant_audit
-> root_finalize
-> terminal receipt
```

Every future phase must have:

- lifecycle request ID and policy version;
- stable idempotency key;
- bounded cursor and deterministic page size;
- status, attempt count, and retryable/terminal error classification;
- effect receipt written only after the effect is confirmed;
- an interruption fixture before and after the effect;
- no dependency on one unbounded cross-domain transaction.

## Domain rules

### Identity and private state

Sessions revoke first. Entitlements and operator authority stop granting effects. Profile, personal memory, preferences, provider auth state, member profile state, and private agent/thread state delete in bounded phases.

### Direct messages

The deleting participant leaves. Conversation and messages remain. `createdByUserId`, participant identity, and sender attribution require nullable/tombstone-capable schema where they are not already optional. Specifically deleting a message is a separate content operation that writes a durable tombstone visible to all participants.

### Community access and content

Membership leaves through the canonical access transition so member counts and billing/access projections reconcile. Community posts, interactions, resources, events, changesets, attachments, and feed content remain under community authority while deleted-account attribution detaches. Personal reactions may be deleted and aggregates recomputed.

### Apps and skills

Developer apps and skill packages block deletion until transferred or explicitly removed. Connections, snapshots, mounts, revisions, and attachments follow that parent decision. User-private installs and OAuth state are revoked/deleted.

### Workspace and runtime

External workspace resources release first with provider receipts. Private project, terminal, message, attachment, run, and event state then deletes. Usage/charge evidence is handled independently by finance retention.

### Finance, legal, audit, and diagnostics

Builder Partner, commissions, payouts, charges, settlements, subscriptions, claims, legal acceptance, and required audit evidence retain only the minimum allowed representation. Diagnostics and analytics require explicit security/operations TTLs or aggregation. None may continue to point at an access-granting product identity.

### Evidence and intelligence

Source units, traces, archives, citations, retrieval logs, intelligence nodes/edges/mutations, change requests, outcomes, metabolizer runs, and compiler digests participate in privacy lineage. Account deletion alone detaches attribution; explicit content purge triggers evidence removal and derived re-evaluation.

## Bounded lookup rule

A direct user reference is executable only when one of these is true:

1. a schema index begins with that exact user field; or
2. the policy names a bounded parent cascade whose parent is itself indexed by the user.

The current proof identifies 40 edges that do not have a user-first index. Thirty-three require new indexes; seven are intentionally reached through a bounded parent, such as partner children through `builderPartners` and private workspace snapshots through their owned project.

No executor may replace a missing index with `.collect()`, a global scan, or a hard-coded list of “known” referencing tables.

## Execution blockers

1. Historical Builder Partner obligations must preserve their recorded policy and economic basis; account deletion cannot rewrite or erase them.
2. Finance/legal/security/provider/backup retention owners must approve explicit TTLs and bases.
3. Every `index_required` edge must receive its bounded index.
4. Required actor references need nullable or explicit tombstone schema.
5. DM participant departure and shared projection semantics need behavioral proof.
6. Privacy lineage must reach archives, evidence, retrieval, digests, and accepted intelligence.
7. The account deletion quarantine cannot be removed by a structural or regex-only proof.

These blockers prevent execution, not policy classification. Undecided behavior must remain visible rather than being guessed by an executor.

## Implementation order

1. **Complete groundwork:** declarative account policy, schema drift proof, destructive-executor quarantine, and prospective Builder Partner v3 economics.
2. **Complete in C2.0A:** reconcile stale policy/document/blocker truth and separate the three lifecycle jobs.
3. **Complete in C2.0B:** delete the unowned anonymous-user executor/tooling without executing it or changing the 56 development roots.
4. Build an account-specific request/preflight/checkpoint/receipt substrate with no destructive executor or public UI.
5. Add access-freeze, private-state, and external-provider executors behind interruption fixtures.
6. Add DM participant-departure and shared tombstone execution.
7. Add community-content attribution and ownership execution.
8. Add evidence/intelligence privacy propagation.
9. Add finance/legal/audit minimization and retention enforcement.
10. Add invariant audit, root-last finalizer, and terminal receipt.
11. Define and build the separate community lifecycle from its own ownership matrix.
12. Re-enable self-service deletion only after full interruption, scale, orphan, provider, and cross-user behavioral proofs.

## Proof required before re-enabling deletion

A synthetic fixture must include:

- two users with a shared DM and attachments;
- community membership, posts, replies, reactions, resources, events, changesets, and canonical interactions;
- personal memory, profile, provider credentials, workspace resources, messages, and storage;
- unresolved and settled subscriptions, credits, Builder Partner commission/payout state, disputes, and legal receipts;
- audit/diagnostic history;
- source evidence, archives, retrieval logs, accepted intelligence, and independently supported versus unsupported derived nodes;
- an interruption before and after every external and local phase.

The proof must demonstrate retry safety, bounded reads, other-party/community continuity, deleted-identity non-resolution, required financial/legal retention, provider/storage convergence, privacy propagation, zero unexpected orphans, and root deletion last.

## Idiot-index guardrails

| Candidate | Idiot index | Decision |
| --- | ---: | --- |
| re-enable the legacy one-transaction mutation | 10 | forbidden |
| delete a DM because one participant deletes an account | 10 | forbidden |
| treat creator attribution as ownership of community content | 10 | forbidden |
| equate account deletion with authored-content purge | 10 | forbidden |
| maintain a second manual table list without schema drift proof | 10 | forbidden |
| guess legal/security TTLs in product code | 9 | forbidden |
| build a generic workflow engine before domain semantics | 8 | forbidden |
| typed declarative policy plus schema drift proof | 1 | keep |

## C2 non-goals

C2 does not authorize a generic workflow engine, public deletion controls, an operator dashboard, an automation framework, one cross-domain deletion mutation, guessed retention periods, or automatic destruction of shared authored content.

## Non-effects of this contract

This document and its typed registry do not:

- change schema or stored data;
- call staging or production;
- revoke a provider or delete storage;
- enable account or content deletion;
- set retention periods;
- modify Builder Partner economics;
- implement community deletion;
- authorize any destructive migration.
