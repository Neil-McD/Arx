# Arx MVP — Architecture Contract v2.0

Arx is a **community + agent platform** with two primary surfaces:
- **Web/PWA (community-first):** discovery, join/pay, chat, resources/library, members, and a **community copilot**.
- **Desktop (power surface):** everything web has **plus** a local **operator agent** that can use local tools (filesystem/shell) inside a user-selected workspace.

This contract optimizes for **simplicity, scalability, reliability, and UX** while keeping the system adaptable to future execution substrates (cloud → decentralized compute) and future payment rails (Stripe → crypto).

Default mode is **BUILD**. Only switch to **EXPLORE** when explicitly asked. In EXPLORE, destructive actions are denied.

---

## 0) First Principles (Invariants)

### Canonical State
- **Cloud is canonical** for: `users/profiles`, `communities`, `entitlements`, `plans`, `payments`, `threads/messages`, and **personal + community memory**.
- **Desktop local storage is not canonical cognition.** It stores workspace bindings, local approvals state, and optional caches.
  - Desktop stores **runtime evidence + blobs** for the operator agent and mirrors user/assistant messages back to the cloud thread.
  - Threads/messages/memory are **cloud-canonical when signed in**; offline/local-only chat is not an MVP requirement.
- Users can export their cognition as **CSV** (threads/messages/personal memory) from Settings (web or desktop).
- Users can reset/clear the desktop’s local cache (SQLite + blobs) without affecting cloud data.

### Access Control
- **Entitlements are canonical** access control. The UI never gates access based on provider-specific payment state.
- **Role + entitlement checks happen per request** (no “checked once at login” assumption).

### Surface Capabilities (Enforced, Not Advisory)
- **Capabilities differ by surface** and must be enforced server-side:
  - Web copilot can only operate on **cloud community objects** (chat/resources/members).
  - Desktop operator can operate on **local workspace tools** only when a workspace is locally bound.
- Prompt instructions/manifests are helpful, but **hard enforcement** is the guarantee.

### MVP Critical Guardrails
- **No “superuser bot”:** any copilot/router that uses privileged keys must still enforce the same `user_id + community_id + role` checks per call; prefer user-scoped queries or SECURITY DEFINER RPCs that validate scope and fail closed.
- **No “paid but can’t access”:** payment finality is webhook/provider-verified; redirects are not trusted. Users must have a recovery path (e.g. “Pending purchases” after login / resend link) so they can always claim access.

### Payments (Rail-Agnostic)
- Payments produce **receipts** (Stripe now, tx hashes later).
- Receipts mint/extend **entitlements** through deterministic server rules.
- For subscriptions (monthly/yearly), **provider subscription mapping** is mandatory (no email correlation for renewals).
- **Payment finality must not depend on browser redirects.** Webhooks (and/or provider API verification) are authoritative; `checkout_finalize` is UX-only and must be idempotent.

### Memory (Two Levels)
- **Personal memory**: explicit user-controlled durable facts/preferences. No silent writes.
- **Community memory**: curated resources/artifacts. Raw chat is not “memory” by default.
- Retrieval/injection must include **provenance** (what memory was used and why).

### “Own Your Thoughts” (Crypto-Ready Framing)
- Ownership is ultimately **cryptographic control** (keys) rather than “must run locally.”
- v2.0 supports cloud-canonical cognition now; E2EE is deferred but the data model should be compatible with ciphertext later.
  - Note: E2EE constrains server-side search/RAG; plan for client-side indexing or metadata-only retrieval when E2EE ships.

---

## 1) Durable Primitives (Irreducible)

### Cloud primitives (Supabase; canonical)
- **User / Profile**
- **Community**
- **Entitlement** (canonical access)
- **Plan**
- **PaymentIntent** (pre-checkout attempt)
- **PaymentReceipt** (normalized evidence)
- **ProviderSubscription** (monthly/yearly lifecycle mapping)
- **PurchaseClaim** (pay-first bridge token)
- **Thread**
- **Message**
- **PersonalMemoryItem**
- **CommunityResource** (community memory)

### Local primitives (Desktop; device-local)
- **WorkspaceBinding**: maps `thread_id` → `workspace_path/scope` on a specific device.
- **Session approvals**: “allow write/edit this session” and other device-local UX state.
- Optional caches (non-canonical): recent lists, drafts, local render caches.

---

## 2) Cloud Database (Supabase — replaceable)

Cloud is canonical for cross-device UX and community-first flows.

### 2.1 Core community
- `communities`
- `community_memberships` (roles/ownership)
- `community_invites` (optional for free joins / tracking)

### 2.2 Community memory (curated)
- `community_resources` (unified “post/resource” model; supports embeds: YouTube/Wistia/images/links)

### 2.3 Cognition (threads/messages)
- `threads` (cloud-canonical)
- `messages` (cloud-canonical; stable ordering per thread)
  - Ordering must not rely on timestamps. Use a server-assigned monotonic `seq` (or allocator) per thread and order by it.

### 2.4 Personal memory
- `personal_memory_items` (explicit user writes; pinned/tags optional)

### 2.5 Monetization + payments (monthly/yearly)
- `plans` (provider-agnostic pricing + billing period)
- `payment_intents` (user_id nullable until claim redeem)
- `payment_receipts` (normalized; raw_json preserved)
- `provider_subscriptions` (maps provider subscription id → plan/community; binds to user_id on claim redeem)
- `purchase_claims` (hash-only; single-use; expiring)
- `payment_provider_events` (webhook idempotency ledger)

---

## 3) Desktop Local Storage (SQLite; minimal)

Desktop local storage exists to enable the “operator agent” safely.

Must store:
- `workspace_bindings` (device-local): `thread_id`, `workspace_path`, `workspace_scope_id`, timestamps
- `workspace_policies` (device-local approvals and scope rules) OR session-scoped policy in memory (MVP)
- run/tool **evidence + blobs** (stdout/stderr/diffs) for crash recovery and UX

Should not be canonical for:
- `threads/messages`
- `personal memory`
- community membership state

Note:
- Removing SQLite entirely is a larger refactor because the desktop operator runtime currently uses it for safe local execution state and evidence. If we later remove it, replace with a minimal file-backed store for bindings/policies.

---

## 4) Components (Minimal)

| Component | Responsibility |
|---|---|
| **Web/PWA Client** | Community UI + discovery + pay-first join + claim redemption + community copilot UX |
| **Desktop Client (Tauri)** | Community UI + operator agent UI; receives deep links; runs local tools with approvals |
| **Supabase DB + RLS** | Canonical state: communities, threads, memory, entitlements, payments |
| **Supabase Edge Functions** | `checkout_start`, `checkout_finalize`, `stripe_webhook` (provider adapters + idempotency) |
| **Copilot Router (Server)** | Executes web copilot tool calls with capability + entitlement enforcement (no local tools); must enforce auth/RBAC even if using privileged keys |
| **Desktop Runtime Service** | Serial agent loop + local tool runner; posts outputs back to cloud threads |

---

## 5) Flows (MVP)

### 5.1 Pay-first join (monthly/yearly)
1) Creator landing page → **Checkout**
2) `checkout_start` creates `payment_intent` + Stripe Checkout Session
3) **Authoritative finalization:** `stripe_webhook` (and/or provider API verification) writes receipt/subscription and updates `payment_intent` status (idempotent)
4) **UX finalization:** Stripe success redirect → `checkout_finalize` (idempotent “status + continue” page; may mint a claim only if payment is confirmed)
5) User continues (web or desktop):
   - Web: `/claim?token=...` → auth → `redeem_purchase_claim`
   - Desktop: `arx://claim?token=...` → auth → `redeem_purchase_claim`
6) `redeem_purchase_claim` binds subscription to `user_id` and issues **entitlement + membership**
7) Recovery must exist for “paid but didn’t finish redirect” (e.g. resend link/email, or “pending purchases” after login) so users never get stuck.

### 5.2 Web community copilot (community-only)
1) User message → build context from:
   - personal memory
   - community resources
2) Model responds; may propose tool actions
3) Server-side copilot router executes only allowed tools (community object model)
4) Tool results are posted as messages/resources; no local side effects exist

### 5.3 Desktop operator agent (local tools)
1) User opens a cloud thread on desktop
2) User binds a local workspace to the thread (device-local `workspace_binding`)
3) Desktop runtime may run local tools subject to policy/approvals
4) Results are posted back into the same cloud thread (so the thread stays canonical)

---

## 6) Permissions & Tooling

### 6.1 Desktop tool policy (approvals)
Allowed by default (within workspace scope):
- `read`, `list_dir`, `glob`, `grep`, `sha256`

Approval required:
- `write`, `edit`, `bash`

Scope rule:
- Tools must be workspace-scope limited by default and must fail closed when denied.
- Workspace scope enforcement must be based on **canonical real paths**:
  - resolve `realpath()` before checks
  - deny `..` traversal and symlink escape outside the bound workspace
  - apply the same rules to globs/recursive searches

### 6.2 Web copilot tools (no local tools)
Web tools must be limited to community operations, for example:
- read/search community resources
- draft or post messages
- create/edit/delete resources (role-gated)
- moderation actions (admin/mod only)

Enforcement:
- Capability + role + entitlement checks are enforced server-side per call.

### 6.3 Web anti-abuse baseline (MVP)
Web write paths must include a minimal anti-abuse baseline:
- rate limits for posting and resource creation (per user and per community)
- role-gated destructive operations (delete, revoke, ban)
- optional “new member slow mode” (first N minutes/messages)

---

## 7) Memory Model (v2.0)

### Personal memory (user)
- Cloud-canonical `personal_memory_items`
- Explicit write only (no silent durable writes)
- Retrieved and injected with provenance

### Community memory (shared)
- Cloud-canonical `community_resources`
- Curated artifacts; raw chat is not memory by default
- Used as evidence for both web copilot and desktop operator agent when community context is enabled

---

## 8) Crypto + Decentralized Compute Readiness

### Identity
- Identity is linkable: email/OAuth now; wallet later.

### Payments
- Keep receipts normalized and provider-agnostic; on-chain payments fit by adding chain fields (tx hash, chain id, addresses, token contract, base units).

### Execution
- Execution substrate must be swappable via an adapter interface later (cloud runner → decentralized runner) without changing entitlements, threads, or memory semantics.

---

## 9) Acceptance Criteria (v2.0)

Cross-device:
- Threads/messages/memory are cloud-canonical and consistent across web + desktop after auth.

Pay-first:
- Web checkout + claim redemption gets a user inside a community on mobile and desktop.

Safety:
- Web runtime cannot execute local tools (enforced server-side).
- Desktop local tool execution is workspace-bound and approval-gated.

Subscriptions:
- Renewals/cancels update access via provider subscription mapping, not email guessing.

---

## 10) What We Defer

- End-to-end encryption (E2EE) for cloud cognition
- Decentralized compute execution adapters
- Advanced moderation / anti-abuse ML
- Enterprise features (SSO, SCIM)
