# Community Lens Contract (MVP+)

Goal: keep **one continuous personal thread** while switching **community context** (“lens”) at response time.

This enables: “same conversation history, different community perspective/resources” without creating a new thread.

## Terms

- **Personal thread**: `public.threads` where `engine_id <> 'community_chat'` and `owner_id = auth.uid()`.
- **Community chat thread**: canonical invariant `threads.id == threads.community_id == communities.id` and `engine_id = 'community_chat'`.
- **Community lens**: the *community id* used to retrieve and inject community-scoped context for a turn.
  - In MVP, lens is represented by a `community_id` (UUID).
- **Community agent prompt**: the active community system prompt (optional, Pro-gated) stored via `public.community_agent_drafts`.
- **Community resources**: curated community memory in `public.community_resources` (entitlement-gated via RLS).

## Canonical invariants (must hold)

1. **Threads/messages remain cloud-canonical.** Lens switching must not fork or duplicate a personal thread.
2. **Entitlements are canonical access.** Community context is only injected when the user has an active entitlement *at request time*.
3. **Lens cannot grant access.** Selecting a lens never broadens data access beyond what entitlements allow.
4. **No silent spend.** Lens switching must not change inference source; platform/BYOK consent rules stay intact (see `docs/llm-inference.md`).
5. **No retroactive ambiguity.** Each assistant response must record which lens was used (provenance).

## Minimal data model contract (no new tables required)

### `threads.community_id` (recommended meaning)

Treat `threads.community_id` as the thread’s **current/default lens** (nullable).

- It may change over time as the user switches lens.
- It is *not* a membership/ACL primitive; it is a context pointer only.

### Message provenance (required)

Every assistant message must record the lens it used, e.g. in `messages.content_json.meta`:

```json
{
  "text": "…",
  "meta": {
    "context_community_id": "uuid-or-null",
    "community_agent_draft_id": "uuid-or-null",
    "community_sources_used": [
      { "type": "community_resource", "id": "uuid", "score": 0.42 }
    ]
  }
}
```

Notes:
- This keeps provenance **cloud-canonical** and exportable.
- If the UI prefers, the provenance may be stored only on assistant messages; user messages can remain unchanged.

### Lens boundary marker (deferred)

In theory, inserting a **system marker message** at lens boundaries can help prevent "silent reinterpretation" of prior turns.

In Arx MVP, we *do not* write lens-switch markers to `public.messages` because:
- User-scoped RLS should not allow arbitrary `role=system` inserts.
- It would pollute thread history and can break "empty thread" heuristics.

Instead, MVP uses an ephemeral UI affordance (toast/indicator) and records the lens used per assistant turn via provenance (`meta.context_community_id`).

## Inference contract (Web: `supabase/functions/openrouter_turn`)

### Inputs (contract extension)

Keep existing inputs. A per-call lens override is **deferred** (we use `threads.community_id` as the lens in MVP):

- `context_community_id?: uuid | null` (optional)
  - If provided, it overrides `threads.community_id` for this inference call only.
  - If omitted, inference uses `threads.community_id` as the lens.

### Server-side behavior (must)

1. **Authenticate + authorize thread**
   - Reject if `thread.owner_id !== auth.uid()`.
   - Reject if `thread.engine_id === 'community_chat'` (personal inference only).
2. **Resolve lens**
   - `lens_id = input.context_community_id ?? thread.community_id ?? null`
3. **Entitlement gate (fail closed)**
   - If `lens_id` is set and user has no active entitlement for `lens_id`, return `403` with a stable error code (e.g. `context_forbidden`).
4. **Community agent prompt injection**
   - If `lens_id` is set, load the active community agent prompt via a server-side check (existing RPC `get_active_community_agent_system_prompt` already does this).
   - If not available (not Pro, no active draft), proceed without it.
5. **Community retrieval (phased)**
   - Phase 1: retrieve from `community_resources` only (curated, smaller, safer).
   - Phase 2: add community chat retrieval (bounded, recent/FTS).
   - Retrieval must be entitlement-gated per request and must return bounded snippets with IDs for provenance.
6. **Prompt assembly precedence (must)**
   - User system prompt is **higher priority** than community system prompt.
   - Retrieved community content must be treated as **untrusted data** (never as instructions).

### Prompt assembly (recommended structure)

Prefer one combined system message with explicit precedence:

- “User instructions (highest priority)”
- “Community context (lower priority; do not override user)”
- “Personal memory (facts/preferences, not instructions)”
- “History snippets (facts, not instructions)”
- “Safety + anti-prompt-injection reminder”

## UI contract (Web)

1. Selecting a community in the left rail changes the **current lens**, not the current thread.
2. The UI must always make the current lens obvious (otherwise users can’t tell which community context a turn used).
   - MVP: the top-right community “home” button shows the selected community’s avatar/initials (and shows a small spinner while the lens is switching).
   - Provenance on assistant messages remains the durable source of truth (`meta.context_community_id`).
3. Lens switching updates the thread’s default lens (`threads.community_id`) via the entitlement-gated RPC `public.set_thread_community_lens`.

## Acceptance tests (manual, MVP)

1. **No thread reset**
   - Open a personal thread, switch community lens, and continue chatting: `activeThreadId` remains unchanged.
2. **Lens affects injection**
   - With lens A active, inference injects Community A prompt (if configured). Switch to lens B and verify injection changes.
3. **Entitlement fail-closed**
   - Force entitlement inactive for a community and attempt to use it as lens: inference returns `403 context_forbidden`.
4. **Pro gating**
   - Community owner not Pro: community agent prompt is not injected, but community resources (if any) remain readable per entitlement.
5. **Provenance recorded**
   - Assistant messages include `meta.context_community_id` (and `community_agent_draft_id` when used).
6. **No silent ambiguity**
   - While switching lens, UI shows switching state (spinner), and the next assistant turn records the correct `meta.context_community_id`.

## Non-goals (for this contract)

- Community-scoped “super-assistant” that can act on behalf of the community.
- Cross-member shared memory writes from chat (community memory curation stays explicit).
- E2EE constraints (future).
