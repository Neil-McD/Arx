# Arx MVP — Architecture Contract v1.5.2

*(v1.4 + Arx-native harness + tool protocol + skills + blob/projection hardening + correctness clarifications)*

You are the AI coding agent for **Arx (MVP)**.

Arx is a **local-first desktop app** that runs an Arx-native coding harness (model + tools) and provides what existing shells/CLIs lack: **continuity**, **memory**, and **community** (including discovery + monetization).

Models handle generation. Tools handle side-effects. **Arx is the truth + identity + memory layer above them.**

Default mode is **BUILD**. Only switch to **EXPLORE** when explicitly asked. *(In v1.5.2, EXPLORE implies “read-only / no side-effects” policy for tools.)*

---

## 0) First Principles (Invariants)

These must always be true. If implementation violates any of these, it’s wrong.

### Truth & Evidence

- **Arx owns truth:** the canonical record is Arx’s data, not any model/provider transcript format.
- **Truth = what happened:** inputs sent, outputs received, and user actions taken, recorded as **Events**.
- **Model output is canonical evidence, not canonical belief.** Anything interpretive is a derived view.
- **Continuity beats cleverness:** resumability/search must work even if the model/provider changes or crashes.
- **Deterministic ordering:** events have a stable total order within a thread (independent of timestamps).
- **Reproducibility is non-negotiable:** every run persists the exact engine/model input bytes (what was sent) and output bytes (what was received).
- **Derived views are rebuildable:** messages/turns/tool cards/summaries are projections and must be derivable from the event stream.
- **Events are append-only:** treat `events` as immutable (no silent edits).

### Memory & Community

- **Memory is retrieval + injection** with provenance and strict scoping. No magic.
- **No silent durable memory edits** by the agent: durable writes require explicit user action or explicit user approval.
- **Community is curated artifacts only:** raw chat/transcripts/logs are non-memory evidence unless explicitly published as artifacts.

### Safety & Permissions

- **Safety is fail-closed:**
  - anything leaving the device (publish) is blocked on secrets (**no override**)
  - anything injected is redacted/omitted
- **Tool execution is permissioned:** side-effectful operations (writes, shell, network) are governed by workspace policy and/or explicit user approval, and all approvals/denials are recorded as events.
- **Sandbox boundaries are real:** workspace scope defines the default boundary; outside-scope access is denied unless explicitly approved and recorded.
- **Truthfulness under uncertainty:** after crashes/recovery, Arx must never claim “success” without evidence.

### Swappability & Identity

- **Backends are swappable:** Supabase now, something else later (including crypto rails), without rewriting local truth.
- **Identity is linkable:** Arx identity can be email/OAuth today and wallet later; backend auth is an implementation detail, not the data model.
- **Money controls access, not truth:**
  - monetization influences **entitlements** only
  - monetization must not bias memory injection ranking or “what the agent believes”

### Single-writer discipline (non-negotiable)

- There is exactly **one authoritative EventWriter** for the local database at all times.
- **All event writes** (user actions, thread edits, memory writes, tool approvals, publish metadata, etc.) must go through the same EventWriter interface.
- UI and other clients are **controllers/viewers** only; they never write to SQLite directly.

Implementation note (MVP-friendly):
- The “writer” may be an OS daemon (future) or an in-process service (today), but the API/semantics must be identical so extraction is packaging, not redesign.

### Concurrency (MVP rule)

- At most one active run per thread.
- Tools execute serially within a run.
- Parallel tool execution, subagents, and multiplexed runs are deferred.
- MVP MAY enforce **one active run total across all threads** (stricter than required) to simplify approvals and UX.

---

## 1) Durable Primitives

Everything reduces to four things. Everything else is a projection (lists, search, summaries, UI views, discovery feeds, analytics).

| Primitive | What it is | Where it lives |
|---|---|---|
| **Thread** | Ongoing work context (engine + workspace + optional community) | Local |
| **Event** | Append-only record of what happened (canonical truth) | Local |
| **PersonalMemoryItem** | Durable user-controlled fact/preference | Local |
| **CommunityArtifact** | Durable curated knowledge unit (explicit + sanitized) | Cloud |

Notes:
- “Discovery,” “Monetization,” “Entitlements,” “Retention loops,” “Conversion surfaces,” and “Moderation” are cloud coordination projections, not canonical truth.
- **Skills are not a primitive.** Skills are local instruction packs (and optionally community artifacts) loaded on-demand as tool evidence.

---

## 2) Local Database (SQLite)

Foundation: append-only events + small tables for fast reads + FTS indexes + **content-addressed blobs** + rebuildable projections.

### 2.0 Definitions (v1.5.2)

**workspace_scope_id (non-negotiable)**  
A single stable identifier for “the sandbox boundary”:
- If `threads.workspace_fingerprint` is present: `workspace_scope_id = threads.workspace_fingerprint`
- Else (MVP fallback): `workspace_scope_id = normalized_realpath(threads.workspace_path)`
- If `threads.workspace_path` is NULL: `workspace_scope_id` is NULL and **all workspace/file tools are disabled** for that thread/run.

This same `workspace_scope_id` is used for:
- `workspace_policies.workspace_scope_id`
- `run_started.workspace_scope_id`
- `tool_call_started.workspace_scope_id`

**device_salt (MVP rule)**  
Generated once per device and stored in OS keychain (or equivalent secure store). Used only for `workspace_fingerprint` derivation.

### 2.1 threads

```sql
threads
id                    TEXT PRIMARY KEY
title                 TEXT
engine_id             TEXT NOT NULL        -- e.g. 'arx_harness' (default) or future external engines
model_id              TEXT                 -- optional default model for UX (not canonical truth)
workspace_path        TEXT
workspace_fingerprint TEXT                 -- optional stable ID for scoping across folder moves
community_id          TEXT                 -- nullable; the firewall switch
created_at            INTEGER NOT NULL
updated_at            INTEGER NOT NULL
last_event_at         INTEGER              -- for fast thread lists
last_seq              INTEGER NOT NULL      -- per-thread monotonic allocator cache
```

Engine vs model clarity (MVP rule):
- `engine_id` identifies the execution backend (Arx harness today; other engines later).
- Per-message model/provider attribution is stored in event payloads (e.g. `provider_id`, `model_id`), not in the thread row.
- `threads.model_id` MAY exist as a UX default, but it is not canonical truth.

workspace_fingerprint (v1.5.2):
- MAY be NULL for pure chat with no tools.
- If **any tool use** is enabled for a thread, a stable workspace boundary is required:
  - if missing at run start, generate baseline `SHA256(device_salt + normalized_realpath)`, persist to thread, and append `thread_metadata_changed`.
- No aliasing/merging in MVP.

### 2.2 blobs (content-addressed; v1.5.2)

Large I/O is first-class: diffs, file snapshots, stdout/stderr, streamed chunks, serialized request/response payloads.

```sql
CREATE TABLE blobs (
  id         TEXT PRIMARY KEY,   -- sha256(bytes)
  rel_path   TEXT NOT NULL,       -- e.g. blobs/ab/cd/<id>
  byte_len   INTEGER NOT NULL,
  mime       TEXT,
  created_at INTEGER NOT NULL
);
```

Blob correctness rule (non-negotiable):
1) **No committed event may reference a missing blob.**
   - Implementation ordering: write temp → fsync → rename final → then commit event referencing `blob_ref` (or `blob_id`).
2) **Orphan blobs are acceptable.**
   - If blob write succeeds but the referencing event never commits (crash/error), the blob may remain on disk unreferenced.
3) **GC is required.**
   - Periodic mark-and-sweep deletes unreferenced blobs older than a safety threshold (avoid racing in-flight writes).

Blob reference rule (v1.5.2):
- Prefer a single “primary blob” pointer on the event row (`events.blob_ref` preferred; `events.blob_id` optional) *plus* explicit, typed blob references inside `payload_json` where needed (e.g. `sent_blob_ref`, `chunk_blob_ref`, `stdout_blob_ref`, `stderr_blob_ref`, `diff_blob_ref`). Blob IDs (sha256) MAY also be included as `*_blob_id` for convenience.
- **EventWriter must validate** that every blob reference (`blob_ref` and `*_blob_ref` / `*_blob_id`) exists before committing the event.

### 2.3 events (canonical truth ledger)

```sql
events
id              TEXT PRIMARY KEY
thread_id       TEXT NOT NULL
seq             INTEGER NOT NULL           -- per-thread monotonic total order
type            TEXT NOT NULL              -- see event types below
created_at      INTEGER NOT NULL

text            TEXT                       -- nullable; previews + FTS (high-signal only)
payload_json    TEXT                       -- versioned, provider-agnostic (payload includes {"v": 1})

blob_ref        TEXT                       -- nullable; references blobs.rel_path (blob id is derived from sha256 filename)
```

Ordering rule (non-negotiable):
- Display/query events via: `ORDER BY seq ASC`
- `seq` is assigned transactionally by Storage/EventWriter.

Truth hierarchy rule (non-negotiable):
- Canonical truth is the event stream, including:
  - `engine_input` (exact bytes sent)
  - `engine_io_chunk` (exact bytes received)
  - tool lifecycle events with stdout/stderr/diffs referenced by blobs
- Views/summaries (`assistant_message`, `handoff_summary`) are derived and must be traceable to evidence.

Events columns vs payload_json (MVP rule):
- MVP MAY keep `run_id` and `tool_call_id` only inside `payload_json`.
- If query performance becomes an issue, Arx MAY add real columns and indexes (`run_id`, `tool_call_id`) as an optimization only.

### 2.4 Event payload conventions (v1.5.2)

- Every event payload MUST include `"v": 1`.
- Canonical/raw content lives in `payload_json` and/or referenced `blob_ref` / `*_blob_ref`.
- `events.text` is a sanitized preview for FTS, not the canonical record.

run_id requirement (non-negotiable):
- All events emitted **after** `run_started` and **before** `run_finished` MUST include `run_id` in `payload_json`.
- `user_message` and `memory_retrieval` MAY omit `run_id` (they can occur outside a run).

Event types (MVP canonical list):
- Core work loop: `user_message`, `memory_retrieval`, `engine_input`, `engine_io_chunk`, `assistant_message`, `handoff_summary`, `thread_metadata_changed`
- Runs: `run_started`, `run_finished`
- Tools: `tool_call_requested`, `tool_call_approved`, `tool_call_denied`, `tool_call_started`, `tool_call_finished`
- Policy: `workspace_policy_changed`
- Memory: `memory_write`
- Community interactions: `artifact_published`, `artifact_viewed`, `artifact_feedback`

Optional event types (MAY emit):
- Engine lifecycle: `engine_started`, `engine_exited`

Minimum payload expectations by type (MVP):

Core evidence:
- `engine_input`: `{ v, engine_id, run_id, provider_id?, model_id?, request_format, sent_text? , sent_blob_id? }` *(mandatory)*
- `engine_io_chunk`: `{ v, engine_id, run_id, stream, chunk_text_preview?, chunk_blob_id? }`

Derived:
- `assistant_message`: `{ v, text, source_event_ids:[...] }` *(required)*

Context provenance:
- `memory_retrieval`: `{ v, personal:[...], community:[...], redactions_applied:[...] }`

Run lifecycle:
- `run_started`: `{ v, run_id, runtime_id:'arx_harness', thread_id, workspace_scope_id, mode:'build'|'explore', policy_snapshot?:{...} }`
- `run_finished`: `{ v, run_id, status:'ok'|'cancelled'|'error', reason? }`

Tool lifecycle (see Appendix A):
- `tool_call_requested`: `{ v, run_id, tool_call_id, tool_call_key, tool_name, args, requires_approval, policy_basis, reason? }`
- `tool_call_approved` / `tool_call_denied`: `{ v, run_id, tool_call_id, approved:boolean, approved_by:'user'|'policy', note? }`
- `tool_call_started`: `{ v, run_id, tool_call_id, attempt, cwd, workspace_scope_id, sandbox:{...} }`
- `tool_call_finished`: `{ v, run_id, tool_call_id, attempt, status:'ok'|'error'|'unknown', reason?, stdout_blob_id?, stderr_blob_id?, exit_code?, artifacts:[...] }`

Tool call identity & idempotency (non-negotiable):
- `tool_call_id` is a unique identifier for an execution attempt series.
- `tool_call_key` is a **stable idempotency key** for the logical tool call (assigned by the runtime, not the model).
  - It must be computed from canonicalized inputs (tool name + normalized args + workspace_scope_id + relevant preconditions like `expected_before_sha256`).
- `attempt` increments on retry and is stored on `started/finished`.

Dedupe rules (MVP baseline):
- If a repeated request arrives with the same `tool_call_key`:
  - if an earlier `tool_call_finished(status='ok')` exists → do not re-execute; reuse result.
  - otherwise → pause for recovery/user confirmation (especially for non-idempotent tools like `bash`).

### 2.5 Crash recovery (non-negotiable)

On EventWriter startup:
1) Reconcile runs:
   - find `run_started` without `run_finished` → append `run_finished(status='error', reason='crash_recovery')`
2) Reconcile tool calls:
   - find `tool_call_started` without `tool_call_finished` → append `tool_call_finished(status='unknown', reason='crash_recovery')`
3) UI must render these as interrupted/partial (never pretend success).

Truthfulness rule (v1.5.2):
- A recovered `tool_call_finished(status='unknown')` must not claim stdout/stderr or file artifacts unless independently verified after restart.
- Any verification is recorded as new events (never retroactive edits).

### 2.6 Projections (rebuildable UI performance layer; v1.5.2)

Derived views; rebuild from events.

messages projection:
```sql
CREATE TABLE messages_projection (
  id         TEXT PRIMARY KEY,
  thread_id  TEXT NOT NULL,
  role       TEXT NOT NULL,        -- 'user'|'assistant'
  content_json TEXT NOT NULL,      -- structured content (text + tool cards)
  engine_id  TEXT,
  model_id   TEXT,
  run_id     TEXT,
  created_at INTEGER NOT NULL,
  seq        INTEGER NOT NULL
);
CREATE INDEX idx_messages_projection_thread_seq ON messages_projection(thread_id, seq);
```

turns projection:
```sql
CREATE TABLE turns_projection (
  id                    TEXT PRIMARY KEY,
  thread_id             TEXT NOT NULL,
  user_event_id         TEXT NOT NULL,
  memory_retrieval_event_id TEXT,
  engine_input_event_id TEXT,
  assistant_event_id    TEXT,
  seq_start             INTEGER NOT NULL,
  seq_end               INTEGER,
  created_at            INTEGER NOT NULL
);
CREATE INDEX idx_turns_projection_thread_seq_start ON turns_projection(thread_id, seq_start);
```

tool_calls projection (recommended):
```sql
CREATE TABLE tool_calls (
  tool_call_id TEXT PRIMARY KEY,
  thread_id    TEXT NOT NULL,
  run_id       TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  status       TEXT,               -- 'requested'|'approved'|'denied'|'started'|'finished'
  first_seq    INTEGER NOT NULL,
  last_seq     INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_tool_calls_thread_first_seq ON tool_calls(thread_id, first_seq);
CREATE INDEX idx_tool_calls_run_id ON tool_calls(run_id);
```

Projection update rule:
- Projection updates happen transactionally alongside event writes so they never drift.
- Provide `rebuild_projections` that deletes and rebuilds projections from events.

### 2.7 workspace_policies (permissions state; v1.5.2)

```sql
CREATE TABLE workspace_policies (
  workspace_scope_id TEXT PRIMARY KEY,  -- workspace_fingerprint preferred; fallback normalized path
  policy_json        TEXT NOT NULL,     -- ask/allow/deny per tool + sandbox knobs
  updated_at         INTEGER NOT NULL
);
```

Canonical truth of changes is recorded via `workspace_policy_changed` events.
MVP note:
- Session-scoped approvals (e.g. “allow write/edit for this session”) MAY be kept in runtime memory; persisting workspace policies is still the target state.

### 2.8 personal_memory_items / users / ui_state

Unchanged from v1.4.

### 2.9 FTS discipline (unchanged, reaffirmed)

FTS-indexable event types (MVP):
- `user_message`
- `assistant_message`
- `handoff_summary`
- `thread_metadata_changed`

Do not index by default:
- `engine_io_chunk`
- tool stdout/stderr blobs

If secret-like content detected:
- store raw in payload/blobs (canonical)
- set `events.text` to redacted preview or NULL (not indexed)

---

## 3) Cloud Database (Supabase — replaceable)

Cloud exists for coordination + sharing + discovery + monetization—not canonical truth.

Same as v1.4, with one optional addition:
- `community_artifacts.type` MAY include `'skill'` (curated skill packs), but cloud skill distribution is optional for MVP.

---

## 4) Components (5 only)

| Component | Responsibility |
|---|---|
| **Storage** | SQLite access, migrations, FTS, blob writes + GC, deterministic `seq`, transactional projection updates |
| **Execution Runtime Service (Arx Harness)** | Serial run loop (model → tools → model), permission enforcement, skill discovery/load, streams events; calls Storage/EventWriter for all writes |
| **Context Builder** | Build handoff packet (memory + artifacts), apply redactions, append `memory_retrieval` |
| **Community Backend Adapter** | Directory, plans, entitlements, artifacts, retention, moderation (Supabase now; swappable later) |
| **UI** | Threads/messages/turn inspector, memory, artifact library, discovery, paywall/join, weekly check-ins, chat, approvals panel, run console |

Event writer rule (non-negotiable):
- Only Storage/EventWriter appends events and assigns `seq` transactionally.

---

## 5) Flows (MVP)

### 5.0 Control plane (local)

The UI controls the runtime via a small local API and subscribes to a live event stream.

Minimum operations:
- start run (thread_id, mode, provider/model, workspace scope)
- send user input to active run
- approve/deny tool requests
- cancel run
- subscribe to run events (stream)

Cancellation rule (v1.5.2):
- Cancelling a run MUST append `run_finished(status='cancelled', reason='user_cancel')` (and MAY omit `assistant_message`).

### 5.1 Turn / Injection Flow (audit-grade)

1) User submits message (UI → runtime)
   - append `user_message`
2) Context Builder runs (runtime)
   - retrieve personal memory (+ community artifacts if entitled)
   - redact/omit secrets from injected context
   - append `memory_retrieval`
3) Runtime starts a run
   - append `run_started` (mode + workspace scope + policy snapshot)
4) Construct engine/model input (handoff + user message + tool schemas + policy summary)
   - append `engine_input` (**mandatory**, exact bytes via blob if needed)
5) Model outputs streaming chunks
   - append `engine_io_chunk*` (blob-backed for large chunks)
6) Tool use (optional)
   - append `tool_call_*` events + blob-backed outputs/diffs
   - feed tool results back via next `engine_input`
7) Completion
   - append `assistant_message` (derived, includes `source_event_ids`)
   - append `run_finished`

### 5.2 Tool permission & approval flow (MVP baseline)

Mode enforcement (non-negotiable):
- BUILD mode: tools may execute subject to policy/approval.
- EXPLORE mode: side-effect tools are denied (not “ask”):
  - denied: `write`, `edit`, `bash`, any network tool
  - allowed: `read`, `list_dir`, `glob`, `grep`, `task`, `sha256`, `skill_load`

Allowed by default (within workspace scope):
- `read`, `list_dir`, `glob`, `grep`, `task`, `sha256`, `skill_load`

Approval required:
- `write`, `edit`, `bash`

Denied by default:
- access outside workspace scope
- networked tools (until explicitly enabled later)

Guardrails:
- outside-scope path → deny/ask with explicit user confirmation + event record
- doom-loop detection → pause and require explicit user confirmation

Scope rule (v1.5.2):
- “Allowed” read tools are still workspace-scope limited by default; outside-scope reads must be denied or explicitly approved and recorded (same as writes).
- `skill_load` is an exception: it MAY read from the allowlisted skills roots (`.claude/skills` in-workspace, `~/.claude/skills`, and `~/.config/arx/skills`) as read-only inputs.

### 5.3 Skills (Claude-style SKILL.md packs)

Skills are local packs compatible with the `SKILL.md` convention.

Discovery:
- project: `.claude/skills/<name>/SKILL.md`
- user: `~/.claude/skills/<name>/SKILL.md`
- optional: `~/.config/arx/skills/<name>/SKILL.md`

Rules:
- skills load on-demand via tool `skill_load`
- skill content is returned as a blob (`blob_id`) and is auditable via tool events
- skills never grant privileges; all side-effects still go through tools + permissions
- skills are not injected wholesale into handoff packets

### 5.4 Publish / Discovery / Retention / Moderation / Chat

Unchanged from v1.4 (fail-closed publish; entitlements gate access; chat is hard-walled).

---

## 6) Handoff Packet Format (v1)

Unchanged from v1.4, with the addition:
- Skills are loaded on-demand via `skill_load` and referenced as evidence; they are not injected wholesale by default.

---

## 7) Crypto Readiness

Unchanged from v1.4.

---

## 8) Acceptance Criteria (v1.5.2)

Continuity + auditability:
- Thread list sorted by `last_event_at`
- Thread loads events ordered by `seq`
- Resume works after crash (events persisted before ack)
- Every turn logs: `user_message → memory_retrieval → run_started → engine_input → engine_io_chunk* → assistant_message → run_finished`
- `assistant_message` always includes `source_event_ids`

Tools + permissions:
- executed tool calls include `tool_call_requested` → `tool_call_started` → `tool_call_finished`; denied calls include `tool_call_requested` → `tool_call_denied` (no started/finished)
- approvals recorded when required
- outputs/diffs referenced via blobs
- outside-scope access is denied/explicitly gated and recorded

Single-writer:
- only EventWriter assigns `seq`; UI never writes SQLite directly

Blob correctness:
- events never reference missing blobs
- orphan blobs are cleaned by GC

Projections:
- thread view uses messages projection
- turn inspector uses turns projection
- projections can be rebuilt from events

Skills:
- discover local skills
- load via `skill_load` with blob evidence
- never bypass tool permissions

Community + monetization:
- directory, landing surfaces, plans, entitlements, retention, moderation present (per v1.4)

---

## 9) Build Order (v1.5.2)

1) Storage hardening:
   - content-addressed blobs + GC
   - deterministic `seq` (single writer)
   - messages/turns/tool_calls projections + rebuild
2) Arx harness runtime (serial loop):
   - local API + event stream
   - model adapter (MVP: OpenRouter provider)
   - protocol routing (MVP): use OpenRouter `/v1/messages` for `anthropic/*` models; use OpenRouter `/v1/chat/completions` (OpenAI-compatible) for everything else; record the choice in `engine_input.request_format`
3) Tool suite (minimal):
   - `read`, `list_dir`, `glob`, `grep`, `task`, `sha256`, `write`, `edit`, `bash`, `skill_load`
4) Permissions engine:
   - workspace policies + approval UI + guardrails
5) Context Builder:
   - injection + redaction + `memory_retrieval` logging
6) Community backend + artifacts:
   - directory, entitlements, publish gating, artifact library
7) Retention + moderation + chat:
   - unchanged MVP features

---

## 10) What We Defer

- Parallel tool execution / concurrency inside a run
- Subagents / multi-agent orchestration
- MCP / external tool servers
- Cloud runners / remote execution
- Deep workflow execution engine (playbooks remain content)
- Repo mirroring, vector search, E2EE sync
- Advanced reputation systems / anti-abuse ML
- On-chain commitments (optional anchors later)

---

## Appendix A — Minimal Tool Contract (v1.5.2)

Tools (MVP):
- Read-only:
  - `read(path, offset?, limit?)` → line-numbered text
  - `list_dir(path)` → files vs folders
  - `glob(pat, path?)`
  - `grep(pat, path?, include?)` → regex search (ripgrep-first)
  - `sha256(path)` → file content hash helper
  - `task(path?, pat?, query?, list?)` → read-only helper (bundles common exploration)
- Approval-gated:
  - `write(path, content, expected_before_sha256?)` (or `write(writes:[{path, content}, ...])`)
  - `edit(path, old, new, all?, expected_before_sha256?)`
  - `bash(cmd, cwd?)`
- Optional / deferred (MVP):
  - `skill_load(name)` → returns `SKILL.md` content + metadata

Tool evidence requirements:
- Every tool execution produces:
  - `tool_call_requested` with args
  - `tool_call_started` before execution
  - `tool_call_finished` with stdout/stderr blobs (if any) and file artifacts/diff blobs when changed

Expected-before semantics (v1.5.2):
- If `expected_before_sha256` is provided:
  - For overwrites: it must match current content hash (fail safely if not).
  - For creates: `expected_before_sha256 = null` means “must not exist”.
  - Any mismatch must produce a non-destructive error and a `tool_call_finished(status='error')` (no partial writes).
- If `expected_before_sha256` is omitted or empty:
  - MVP MAY proceed “nano-style” (subject to approval), using current file contents as the base.

Tool schema compatibility (v1.5.2):
- Keep tool schemas within the widely-supported JSON Schema subset (object `properties` + `required`); avoid `anyOf`/`oneOf`/`allOf` to prevent provider 400s via OpenRouter.
- Represent “nullable” inputs by omitting the field (or using empty string) rather than schema unions.
