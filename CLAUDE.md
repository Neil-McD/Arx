# Arx — Contract (v2.0 mirror)

`AGENTS.md` is the source of truth. This file is a shorter, tooling-oriented mirror for contributors and agents.

Arx is a **community + agent platform** with two primary surfaces:
- **Web/PWA (community-first):** discovery, join/pay, chat, resources/library, members, and a **community copilot**.
- **Desktop (power surface):** everything web has **plus** a local **operator agent** that can use local tools (filesystem/shell) inside a user-selected workspace.

## Canonical truth
- **Cloud (Supabase) is canonical** for: `users/profiles`, `communities`, `entitlements`, `plans`, `payments`, `threads/messages`, and **personal + community memory**.
- **Desktop local storage is not canonical cognition.** It exists for:
  - workspace bindings (device-local)
  - approvals/session state (device-local)
  - operator run evidence + blobs (for crash recovery + “what happened” truth for local side-effects)
- Users can export their cognition as **CSV** (threads/messages/personal memory) from Settings.

## Threads/messages ordering (non-negotiable)
- Never rely on timestamps for ordering.
- Cloud messages are ordered by a **server-assigned per-thread monotonic `seq`**.

## Surfaces and capabilities (enforced, not advisory)
- **Web copilot** can only operate on cloud community objects (chat/resources/members), and must be enforced server-side.
- **Desktop operator** can run local tools only when a workspace is bound and scope checks pass.
- Prompt “capability manifests” are helpful, but **hard enforcement** (router/tool runner + RBAC/RLS) is the guarantee.

## Payments (monthly/yearly; web-first)
- Payments are rail-agnostic: store normalized **receipts** + raw payloads, issue/extend **entitlements** deterministically.
- **Payment finality must not depend on browser redirects.**
  - Webhooks (and/or provider API verification) are authoritative.
  - `checkout_finalize` is UX-only and must be idempotent.
- Subscriptions require stable provider mapping (`provider_subscription_id → community/plan`), and the mapping binds to `user_id` on claim redeem.

## Memory model
- **Personal memory:** explicit user-controlled durable items; no silent writes.
- **Community memory:** curated resources/artifacts; raw chat is not memory by default.
- Retrieval/injection must be traceable (provenance: what was used and why).

## Desktop operator tools (approvals + scoping)
Available tool names in the desktop operator runtime:
- Read-only: `read`, `list_dir`, `glob`, `grep`, `sha256`
- Approval-gated: `write`, `edit`, `bash`

Scoping:
- File paths must be resolved to canonical real paths and verified within the bound workspace (deny traversal and symlink escapes).

## Web anti-abuse baseline
Web write paths must have at minimum:
- rate limits for posting/resource creation
- role-gated destructive ops (delete/revoke/ban)
- per-request entitlement/role enforcement (no “checked once at login”)

## Crypto/decentralized readiness (pragmatic)
- Keep payment rails swappable (Stripe now; wallet later) without rewriting entitlements.
- Keep execution substrate swappable (cloud now; decentralized compute later) by routing through adapters and evidence logs.

## Repo notes
- `src/`: desktop UI (shared styling/components)
- `src-tauri/`: desktop runtime + local tool runner
- `apps/web/`: web app
- `supabase/`: edge functions, migrations, and web join/landing plumbing
- `references/`: research/inspiration; keep separate from product code paths
