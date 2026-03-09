# PolyNet.ai — MVP Agent Contract (v1)

PolyNet.ai is the first collective intelligence platform that lets anyone build their own collective intelligence.

This file is the execution contract for agents working in this repository.

## 0) Vision and Philosophy

### Product Vision
- Build communities that can think, remember, and act with AI.
- Give founders a simple way to launch a community intelligence system.
- Keep the system understandable: explicit memory, explicit access, explicit payment state.

### Product Philosophy
- Simplicity is a feature: fewer surfaces, fewer flows, fewer hidden states.
- Reliability over cleverness: deterministic behavior beats magic.
- Security and trust by default: fail closed on permission boundaries.
- Community value first: optimize creator setup + member participation loop.

### MVP North Star
- A founder can create a community, share a funnel link, and onboard members through a gated flow.
- Members can join, chat/post/use voice, access resources, and use personal AI threads.
- AI in a thread can switch community context safely and deterministically.

---

## 1) MVP In Scope (Must Keep)

- Auth and session lifecycle.
- Community creation and management.
- Community visibility model simplified to `Published` and `Unlisted`.
- Discover page retained using simplified visibility semantics.
- Gated community access model (including for `Published` communities).
- Public community funnels for founder-shared links (YouTube/social/direct).
- Core member UX: join, navigate, post/chat, and voice.
- Billing and provider/account connections.
- Automated payouts for community builders (existing community payout flow).
- Tiered access and quota enforcement for personal AI usage.
- Personal AI threads with community lens/context switching inside a thread.
- Ongoing `App.tsx` decomposition and cleanup required for launch stability.

---

## 2) Deferred (Must Not Expand During MVP)

- Affiliate system as a launch requirement.
- Automated affiliate payouts.
- Advanced automations/workflow depth beyond minimal alpha.
- Funnel builder.
- Duplicate/legacy UI surfaces not required for MVP journeys.
- Extra inference-gating complexity beyond minimal tier limits.
- Nice-to-have platform expansions not directly improving creator setup + member participation.

---

## 3) Do-Not-Delete Platform Core

These are protected and must not be removed in MVP simplification passes:

- Coding harness.
- Community harness.
- Community compiler.
- Community resources/memory systems.
- References folders (research context).

If a cleanup touches any of the above, require explicit human confirmation.

---

## 4) Architecture Invariants (Non-Negotiable)

### Canonical Data
- Cloud is canonical for users, communities, memberships/entitlements, billing state, threads/messages, and memory records.
- Runtime event storage is operational evidence and workspace policy state; it is not the product source of truth.

### Community Access + Visibility
- Visibility has only two states: `Published` and `Unlisted`.
- `Published` does not mean ungated access; entitlement and membership checks still apply.
- Community funnel is a single canonical entry surface for join/gate.

### Thread Community Lens
- Thread-level community context is explicit and server-validated.
- Switching lens affects subsequent turns only, never retroactively mutates prior turns.
- Lens context must fail closed if membership/entitlement is missing.
- Context used for each turn must be auditable from stored thread records/events.

### Payments and Entitlements
- Redirects are UX only; provider/webhook verification is authoritative.
- `checkout_finalize` must remain idempotent.
- Access decisions are entitlement-driven and evaluated per request.
- Automated payouts for community builders remain active for MVP.

### Security and Tool Boundaries
- Web runtime cannot execute local filesystem/shell tools.
- Daytona cloud tools are workspace-bounded and approval-gated.
- Path traversal and symlink escape must fail closed.

---

## 5) Irreducibility Rules for Repo Simplification

When deciding keep vs delete:

1. Keep only what directly supports MVP scope above.
2. If there is no first-party call path, mark as delete candidate.
3. Prefer one canonical flow per job (one funnel path, one gate path, one checkout completion path).
4. Remove dead docs/contracts/migrations for deferred systems once replacement truth exists.
5. Do not keep duplicate “just in case” surfaces.

Classification buckets for every candidate:
- `KEEP (MVP core)`
- `DELETE (deferred/dead)`
- `DECISION REQUIRED (user confirmation)`

---

## 6) Agent Execution Rules

- Default mode: `BUILD`.
- Use `EXPLORE` only when explicitly requested.
- Do not add new deferred features.
- Do not widen scope while fixing MVP issues.
- Keep changes small, reversible, and verifiable.
- Update docs/contracts in the same PR when behavior changes.
- Prefer deletion over partial deprecation for non-MVP paths.

---

## 7) MVP Acceptance Checklist

All must be demonstrably true:

- Auth/session works across the canonical web surface.
- Founder can create/manage community and share funnel link.
- Member can discover/open funnel, pass gate, and join community.
- Community usage loop works: navigate, post/chat, voice, resources.
- Thread lens switch between communities works and remains auditable.
- Billing flow reaches entitlement correctly; builder payouts continue.
- No deferred feature is required to complete primary MVP journeys.

---

## 8) Definition of Done for “8/10 MVP”

We call MVP ready only when:

- Simplicity: no major duplicate surfaces; MVP boundary enforced.
- Scalability: modular boundaries improve and monolith concentration is reducing.
- Reliability: core join/chat/lens/billing flows are covered by automated contract tests.
- Security: permission and scope boundaries fail closed.
- Robustness: failure/retry paths are deterministic and recoverable.

If a change harms these five dimensions, it is out of scope for launch.
