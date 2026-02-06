# Thread Domains Contract (Alpha / MVP)

This contract defines where threads live, what can be shared, and what must never be mixed.

Goal: ship a strong alpha with clear boundaries now, while preserving a clean path to future sync.

## First-principles model

Arx has three distinct thread domains:

- Desktop private work: local-first, filesystem-aware, harness-enabled.
- Web private work: cloud-private, user-owned, no local filesystem coupling.
- Community collaboration: cloud-shared, entitlement-gated, cross-device.

If these domains are blurred, trust, security, and user expectations break. So they must remain explicit.

## Canonical terms

- Thread: one conversation/work timeline (messages, runs, tool activity, metadata).
- Domain: the ownership and storage boundary a thread belongs to.
- Surface: desktop app or web app.
- Community thread: canonical cloud thread for a community chat context.

## Domain definitions

### 1) Desktop local thread

- Storage: desktop SQLite only.
- Visibility: desktop only.
- Capabilities: full local harness and workspace tools (subject to policy and approvals).
- Sync: no automatic cloud sync in MVP.

### 2) Web private cloud thread

- Storage: cloud (`public.threads` + `public.messages`) owned by authenticated user.
- Visibility: web across signed-in devices.
- Capabilities: web runtime only, no desktop-local filesystem assumptions.
- Sync: no automatic import/export with desktop local threads in MVP.

### 3) Community shared cloud thread

- Storage: cloud community thread (`engine_id = 'community_chat'`).
- Visibility: any entitled member on desktop and web.
- Capabilities: community chat and community resources under entitlement and RLS.
- Sync: cross-device by design (cloud canonical).

## Non-negotiable invariants

1. Desktop local threads never auto-appear on web.
2. Web private cloud threads never auto-appear in desktop local thread lists.
3. Community threads are shared across desktop and web.
4. Entitlements and RLS are the authority for community access.
5. Thread listings must always be domain-scoped, never implicit unions.
6. Thread lifecycle operations (create/update/delete/send) must execute only within the selected domain.
7. Missing workspace context for local harness runs fails closed (no silent fallback).

## Surface behavior contract

### Desktop app

- Shows:
  - Local thread list (desktop domain).
  - Community UI (community domain).
- Does not show:
  - Web-private user thread list.
- Must label contexts clearly (`Local`, `Community`).

### Web app

- Shows:
  - Web-private cloud thread list.
  - Community UI (community domain).
- Does not show:
  - Desktop-local thread list.
- Must label contexts clearly (`Web`, `Community`).

## Data and API contract

### Desktop local domain

- Source of truth: local SQLite events and projections.
- Commands must enforce:
  - `thread exists` on metadata mutation.
  - deterministic ordering and append-only events.
  - explicit workspace path for side-effectful runs.

### Web private cloud domain

- Source of truth: cloud `threads/messages` owned by `auth.uid()`.
- Policies must enforce owner-only access for private non-community threads.

### Community cloud domain

- Source of truth: cloud `threads/messages/community_resources`.
- Policies and checks must enforce active entitlement.
- Canonical community chat thread identity remains:
  - `engine_id = 'community_chat'`
  - `threads.id == threads.community_id`

## UX contract

1. User can always answer: "where does this thread live?"
2. Domain indicator is always visible on thread rows and thread header.
3. No hidden cross-domain thread migration.
4. Any explicit export/import (future) must be user-triggered and auditable.

## Reliability and failure semantics

1. Handshake/capability uncertainty fails closed to safe refresh behavior.
2. Domain mismatch errors are explicit, not silently coerced.
3. Metadata writes are atomic and error on no-op missing-thread updates.
4. UI selection self-heals if active thread disappears from current domain list.

## Acceptance criteria (Alpha/MVP)

1. Create desktop local thread -> visible on desktop, absent on web.
2. Create web private thread -> visible on web, absent from desktop local list.
3. Join/post in community on desktop -> visible in community on web.
4. Join/post in community on web -> visible in community on desktop.
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

