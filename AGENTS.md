# Arx MVP — Architecture Contract

You are the AI coding agent for **Arx (MVP)**.

Arx is a **local-first desktop app** that wraps AI coding CLIs (Codex CLI, Claude Code) and provides what they lack: **continuity**, **memory**, and **community**.

Engines handle execution. **Arx is the state + identity + memory layer above them.**

Default mode is **BUILD**. Only switch to **EXPLORE** when explicitly asked.

---

## 0) First Principles (Invariants)

These must always be true. If implementation violates any of these, it's wrong.

1. **Arx owns truth**: the canonical record is Arx's data, not any engine's transcript format.
2. **Continuity beats cleverness**: resumability/search must work even if the engine crashes or changes.
3. **Memory is retrieval + injection**: with provenance and strict scoping. No magic.
4. **Community is curated artifacts only**: chat, PTY logs, and raw transcripts are non-memory evidence unless explicitly published.
5. **Safety is fail-closed**: anything leaving the device (publish) is blocked on secrets; anything injected is redacted/omitted.
6. **Backends are swappable**: community coordination is Supabase now, something else later (including crypto rails), without rewriting local truth.
7. **Identity is linkable**: Arx user identity can be email/OAuth today and wallet later; backend auth is an implementation detail, not the data model.

---

## 1) Durable Primitives

Everything reduces to four things. Everything else is a projection (lists, search, summaries, UI views).

| Primitive | What it is | Where it lives |
|-----------|------------|----------------|
| **Thread** | An ongoing work context (engine + workspace + optional community) | Local |
| **Event** | An append-only record of what happened (canonical truth) | Local |
| **PersonalMemoryItem** | A durable user-controlled fact/preference | Local |
| **CommunityArtifact** | A durable curated knowledge unit (explicit + sanitized) | Cloud |

---

## 2) Local Database (SQLite)

The foundation: append-only events + small tables for fast reads + FTS indexes.

### threads
```sql
id              TEXT PRIMARY KEY
title           TEXT
engine_id       TEXT NOT NULL        -- 'codex_cli' | 'claude_code'
workspace_path  TEXT
community_id    TEXT                 -- nullable; the firewall switch
created_at      INTEGER NOT NULL
updated_at      INTEGER NOT NULL
last_event_at   INTEGER              -- for fast thread lists
```

### events (canonical truth ledger)
```sql
id              TEXT PRIMARY KEY
thread_id       TEXT NOT NULL
type            TEXT NOT NULL        -- see event types below
created_at      INTEGER NOT NULL
text            TEXT                 -- nullable; for previews + FTS
payload_json    TEXT                 -- versioned, provider-agnostic
blob_ref        TEXT                 -- nullable; file path for huge PTY chunks
```

**Event types (MVP)**:
- `user_message` — user submitted input
- `engine_io_chunk` — raw engine output (always valid, fallback truth)
- `assistant_message` — segmented response (only when confident)
- `thread_metadata_changed` — title, engine, workspace updates
- `memory_write` — personal memory created/updated
- `memory_retrieval` — what was injected (IDs + snippets + provenance)
- `artifact_published` — artifact sent to community
- `artifact_viewed` — user opened artifact in UI
- `artifact_feedback` — 👍/👎 recorded for an artifact

### personal_memory_items
```sql
id                  TEXT PRIMARY KEY
content             TEXT NOT NULL    -- human-readable sentence
scope               TEXT NOT NULL    -- 'global' | 'workspace'
scope_id            TEXT             -- workspace path when scope='workspace'
pinned              INTEGER DEFAULT 0
provenance_event_id TEXT             -- which event created this
created_at          INTEGER NOT NULL
updated_at          INTEGER NOT NULL
```

### community_artifacts_cache (offline + fast search)
```sql
artifact_id     TEXT PRIMARY KEY
community_id    TEXT NOT NULL
type            TEXT NOT NULL
title           TEXT NOT NULL
body_md         TEXT NOT NULL
visibility      TEXT NOT NULL
injectable      INTEGER NOT NULL
pinned          INTEGER NOT NULL
helpful_count   INTEGER DEFAULT 0
unhelpful_count INTEGER DEFAULT 0
author_name     TEXT
content_hash    TEXT             -- SHA256 for cache invalidation
fetched_at      INTEGER NOT NULL
```

### ui_state
```sql
key             TEXT PRIMARY KEY
value           TEXT
updated_at      INTEGER
```

### FTS Indexes
- `events.text` — thread/message search
- `personal_memory_items.content` — memory search
- `community_artifacts_cache(title, body_md)` — artifact search

---

## 3) Cloud Database (Supabase — replaceable)

Cloud exists for coordination + sharing, not canonical truth.

### communities
```sql
id              UUID PRIMARY KEY
slug            TEXT UNIQUE NOT NULL
name            TEXT NOT NULL
owner_id        UUID NOT NULL
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### community_memberships
```sql
id              UUID PRIMARY KEY
community_id    UUID NOT NULL
user_id         UUID NOT NULL
role            TEXT DEFAULT 'member'  -- 'owner' | 'admin' | 'member'
created_at      TIMESTAMPTZ DEFAULT NOW()
UNIQUE(community_id, user_id)
```

### community_artifacts
```sql
id              UUID PRIMARY KEY
community_id    UUID NOT NULL
author_id       UUID NOT NULL
type            TEXT NOT NULL          -- 'vision' | 'decision' | 'playbook' | 'outcome'
title           TEXT NOT NULL
body_md         TEXT NOT NULL
tags_json       TEXT
visibility      TEXT DEFAULT 'draft'   -- 'draft' | 'published' | 'archived'
injectable      INTEGER DEFAULT 1      -- only meaningful when published
pinned          INTEGER DEFAULT 0      -- admin-only
helpful_count   INTEGER DEFAULT 0
unhelpful_count INTEGER DEFAULT 0
source_type     TEXT NOT NULL          -- 'thread' | 'chat' | 'manual'
source_event_id TEXT                   -- nullable
content_hash    TEXT NOT NULL          -- SHA256 of canonical artifact content (crypto-ready)
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

### artifact_versions (immutable history)
```sql
id              UUID PRIMARY KEY
artifact_id     UUID NOT NULL
body_md         TEXT NOT NULL
content_hash    TEXT NOT NULL          -- SHA256
created_at      TIMESTAMPTZ NOT NULL
created_by      UUID NOT NULL
```

### chat_messages (ephemeral, hard-walled from memory)
```sql
id              UUID PRIMARY KEY
community_id    UUID NOT NULL
author_id       UUID NOT NULL
content         TEXT NOT NULL
created_at      TIMESTAMPTZ DEFAULT NOW()
```

**Chat boundary (non-negotiable)**:
- Chat is never injected into handoff packet
- Chat is never auto-published
- "Save to Community" from chat goes through full sanitization gate
- Chat is social layer, not memory layer

**Ephemeral definition (MVP)**:
- Chat content is not used for memory injection and not considered durable knowledge.
- Provide a retention policy: either TTL delete (e.g. 30–90 days) or explicit “Delete message / Delete history” controls.
- Export/backup focuses on artifacts; chat export is optional and off by default.

**Provenance wiring (MVP)**:
- `source_type='thread'` → `source_event_id` references local `events.id` (the selection that was published)
- `source_type='chat'` → `source_event_id` references `chat_messages.id`
- `source_type='manual'` → `source_event_id` is NULL

---

## 4) Components (5 only)

| Component | Responsibility |
|-----------|----------------|
| **Storage** | SQLite access, migrations, FTS indexes |
| **PTY Engine Adapter** | Spawn/attach engine, send input, capture output → append events |
| **Context Builder** | Build handoff packet each turn (memory + artifacts → text) |
| **Community Backend Adapter** | Interface for artifacts/membership (Supabase now, swappable later) |
| **UI** | Render threads, events, memory list, artifact library, PTY panel, chat |

No internal tool protocol. Engines own execution.

---

## 5) Flows (2 only)

Everything the app does reduces to two flows.

### 5.1 Turn / Injection Flow

```
1. User submits message
   └─→ Append user_message event

2. Context Builder runs:
   ├─→ Retrieve personal_memory_items (filter by scope → rank pinned/recency → budget ~2000 chars)
   ├─→ If thread.community_id set:
   │   └─→ Retrieve artifacts (published + injectable → rank pinned/helpful/recency → budget ~1500 chars)
   ├─→ Redact/omit secrets
   └─→ Append memory_retrieval event (IDs + snippets + provenance)

3. Send handoff packet + user message to engine via PTY

4. Engine outputs chunks
   └─→ Append engine_io_chunk events
```

### 5.2 Publish Flow (fail-closed)

```
1. User explicitly chooses "Publish to Community"
   └─→ Source can be: thread selection, chat message, manual entry

2. Client sanitizer scans for secrets
   └─→ Block if detected; user must fix

3. Server re-checks sanitizer (defense in depth)
   └─→ Reject if secrets found

4. Write to community_artifacts + artifact_versions
   └─→ content_hash = SHA256(canonical_string(type,title,body_md,tags_json))

5. Append artifact_published event locally (provenance + hash)
```

---

## 6) Handoff Packet Format

```
You're helping [user] with [workspace].

Memory:
- [memory item 1]
- [memory item 2]

[If community active:]
Community ([name]):
- [playbook] "Title" — excerpt... (@author)
- [decision] "Title" — excerpt... (@author)

[If resuming:]
Last session: [1-2 sentence summary]
```

---

## 7) Crypto Readiness (no chain commitment)

Rule: **chains store proofs; Arx stores meaning**.

Already baked into schema:
- `content_hash` on every artifact/version (SHA256 of canonical content) — enables anchoring anywhere
- `source_type` + `source_event_id` — clear provenance
- `CommunityBackendAdapter` interface — backend swappable

Future additions (schema-compatible):
- `author_signature`, `author_pubkey` — verifiable authorship
- `external_refs` JSON — `{ type: "tx", chain: "X", id: "..." }`

---

## 8) Acceptance Criteria

The system is correct when all of these pass.

### Continuity
- [ ] Thread list shows all threads sorted by `last_event_at`
- [ ] Clicking a thread loads all events
- [ ] Resume works after crash (events persisted before ack)
- [ ] Search finds threads by title and event text

### Personal Memory
- [ ] User can pin a fact ("Remember this")
- [ ] Pinned facts appear in handoff packet on next turn
- [ ] Memory scoped: global always, workspace only when matched
- [ ] Memory list viewable/searchable/deletable in Settings

### Community Artifacts
- [ ] User can publish artifact (explicit action)
- [ ] Publish blocked if secrets detected (client)
- [ ] Publish rejected if secrets detected (server)
- [ ] Published artifacts appear in library for members
- [ ] Artifacts injected when `thread.community_id` matches

### Injection Attribution
- [ ] Every turn logs `memory_retrieval` event with IDs + snippets
- [ ] User can see "Sources used" after response
- [ ] Sources link back to origin

### Community Isolation
- [ ] User only sees artifacts from their communities
- [ ] RLS enforces `community_id` isolation
- [ ] RLS enforces `community_id` isolation for chat_messages too
- [ ] Switching communities updates injection scope

### Chat Isolation
- [ ] Chat messages never in handoff packet
- [ ] Chat never auto-published
- [ ] "Save to Community" from chat requires sanitization gate

### Engine Agnosticism
- [ ] Thread works with Codex CLI
- [ ] Thread works with Claude Code
- [ ] Switching engine mid-thread inserts handoff summary
- [ ] Events stored in Arx format, not engine format

### Auth + Identity
- [ ] Supabase session tokens are stored in OS keychain (not localStorage)
- [ ] Local user profile can link multiple auth methods over time (email/OAuth now; wallets later)

---

## 9) Build Order

1. **threads + events** — the conversation store + FTS
2. **PTY Engine Adapter** — spawn, capture, append events
3. **personal_memory_items + Context Builder** — memory injection
4. **Community Backend Adapter** — communities, memberships, artifacts
5. **artifacts_cache + sync** — offline search
6. **chat_messages** — community chat (hard-walled)
7. **Polish** — onboarding, resume UX, engine switching, export

---

## 10) What We Defer

- Internal agent loop / tool orchestration / approval cards
- Payments / Stripe entitlements (manual allowlist for now)
- DMs (private 1:1 messaging)
- Cloud vault for generated files
- Deep-linking funnel, repo mirroring, vector search, E2EE sync
- Community skills (shareable workflows)

---

## 11) Modes

**BUILD** (default): ship MVP features with minimal complexity.
**EXPLORE**: only when user explicitly asks to brainstorm product direction.
