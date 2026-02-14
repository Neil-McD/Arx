# Thread Routing + Scope Contract (MVP)

This contract defines where threads live and how they are routed, plus how community context works inside a thread.

Goal: keep the platform simple and trustworthy by making storage boundaries explicit and fail-closed.

## First-principles model

There are two orthogonal axes in MVP:

1. Lane: what the user is doing (`chat` vs `agent`)
2. Storage mode: where the thread is stored (`cloud` vs `local`)

The pair (`lane`, `storage_mode`) is the **routing domain**: it selects the only backend allowed to mutate or read that thread.

### Allowed routing domains (MVP)

MVP supports exactly two routing domains:

- `chat:cloud` (cloud chat threads)
- `agent:local` (desktop agent threads)

Any other combination is unsupported and must error loudly (no silent fallback).

## Scope is not a routing domain

"Community vs private" is a **scope** attribute, not a third storage backend.

- Cloud chat threads (`chat:cloud`) may be:
  - private: `community_id = NULL`
  - community-scoped: `community_id != NULL` (RLS/entitlements gate access)
- Desktop agent threads (`agent:local`) may store a `community_id` as a **local-only lens** for retrieval/injection, but it never implies cloud persistence.

Canonical community chat threads remain a cloud concern:

- `engine_id = 'community_chat'`
- `threads.id == threads.community_id`

## Surface behavior contract

### Desktop app

- Shows:
  - Chat threads (cloud): `chat:cloud` (private + community-scoped)
  - Agent threads (local): `agent:local`
- Never:
  - uploads/syncs agent thread content automatically
  - reads/writes outside the selected routing domain
- Community context switching:
  - `chat:cloud`: persists via `set_thread_context` with optimistic `context_version`
  - `agent:local`: persists locally via the desktop runtime

### Web app

- Shows:
  - Chat threads (cloud): `chat:cloud` (private + community-scoped)
- Does not show:
  - Agent threads (local): `agent:local`

## Non-negotiable invariants

1. A thread belongs to exactly one routing domain.
2. Domain routing is determined from `thread_lane` + `storage_mode` (normalized with `engine_id` when needed); no cross-domain probing by thread id.
3. Thread lifecycle operations (create/update/delete/send) execute only within the selected routing domain.
4. Signed-out cloud mutations fail closed (auth required) and never fall back local.
5. Local agent threads never sync to cloud without explicit user action (future export/import only).
6. Community context switching is per-thread and last-click-wins; cloud uses `context_version` to detect conflicts.
7. Local harness/tool execution requires local thread + workspace context; missing workspace fails closed.

## Reliability expectations

1. Domain mismatch errors are explicit, not silently coerced.
2. UI selection self-heals if an active thread disappears from the current lane list.
3. Any future expansion (e.g. `agent:cloud` or `chat:local`) must be an explicit product decision with a security/privacy review.
5. Local harness run with missing workspace metadata fails with explicit error.
6. Switching between local and community contexts never merges thread histories.
7. Deleting a thread in one private domain does not affect the other private domain.

## Deferred (explicitly not in this release)

- Automatic desktop<->web private thread sync.
- Bi-directional workspace sync and conflict resolution.
- Shared private workspace state across devices.
- Background reconciliation for offline cloud-private writes.

## Implementation order

1. Enforce runtime fail-closed workspace behavior for local runs.
2. Enforce strict thread mutation error semantics (missing thread must fail).
3. Finalize domain-scoped thread list/query paths in each surface.
4. Add visible domain badges and context markers.
5. Add domain-focused integration and parity tests.
