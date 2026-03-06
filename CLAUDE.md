# Arx — Contract (v2.1 mirror)

`AGENTS.md` is the source of truth. This file is a shorter, tooling-oriented mirror for contributors and agents.

## Surfaces
- **Web/PWA:** community UI (discovery + landing/checkout, join, chat, resources, members/admin/analytics) + **personal AI workspace** (cloud threads/messages; platform inference). No local tool execution.
- **Desktop (Tauri):** web features + **operator runtime** that can run local tools inside a bound workspace with approvals; also handles deep links (e.g. `arx://claim?...`).

## Canonical truth
- **Cloud is canonical** for: `profiles`, `communities`, `community_memberships`, `entitlements`, `plans`, `payments`, `threads/messages`, `personal_memory_items`, `community_resources`, and analytics primitives.
- **Desktop local storage is not canonical cognition.** It exists for:
  - workspace bindings (device-local)
  - approvals/session state (device-local)
  - operator run evidence + blobs (truth for local side-effects)

## Access control (non-negotiable)
- **Entitlements = time-bounded access** (`starts_at`/`ends_at`).
- **Roles are manual-only** (`community_memberships.role` + `communities.owner_id`).
- **Checks happen per request**; never rely on UI-only gating.
- **Membership can outlive entitlements**; admin UX shows access status (e.g. `declined`) without exposing payment internals.

## Payments
- **Webhooks are authoritative; redirects are UX-only** (`checkout_finalize` must be idempotent).
- **Pay-first join** mints/extends entitlements via deterministic server rules; recovery via **Pending purchases** + auto-redeem.
- **Subscription delinquency** starts a grace window; access is revoked when grace ends.
- **Revenue analytics** is derived from normalized **payment ledger entries**.

## Threads/messages
- Never rely on timestamps for ordering; order by **server-assigned per-thread monotonic `seq`**.
- `engine_id='community_chat'` threads are community-scoped and must satisfy `threads.id == threads.community_id == communities.id`.
- Personal AI threads are owner-scoped (`engine_id <> 'community_chat'`).

## AI + memory
- MVP AI is **personal-thread scoped** (`agent_turn`); community-scoped AI over `community_resources` is deferred.
- Personal memory is user-controlled (`off` / `suggest` / `auto`) and provenance-bearing.
- Cloud AI history storage is quota-enforced server-side.

## Desktop operator tools (approvals + scoping)
- Allowed by default: `read`, `list_dir`, `glob`, `grep`, `sha256`
- Approval-gated: `write`, `edit`, `bash`
- Scoping: enforce canonical real paths; deny traversal and symlink escapes outside the bound workspace.

## Repo notes
- `src/`: desktop UI
- `src-tauri/`: desktop runtime + local tool runner
- `apps/web/`: web app
- `references/`: research/inspiration; keep separate from product code paths
- `shared/`: cross-surface shared modules (e.g. pay-first flow core)
