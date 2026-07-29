# Polynet.ai — MVP Agent Contract (v1)

Polynet.ai is the first collective intelligence platform that lets anyone build their own collective intelligence.

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
- Members can discover communities, join, chat/post/use voice, access resources, and use their personal agent under an authorized community lens.
- Communities retain a separate community-owned agent for mentions and autonomous cognition.
- External agent harnesses can access authorized community context through the official Polynet MCP.

---

## 1) MVP In Scope (Must Keep)

- Auth and session lifecycle.
- Community creation and management.
- Community visibility model simplified to `Published` and `Unlisted`.
- Discover is a communities-only surface using simplified visibility semantics.
- Gated community access model (including for `Published` communities).
- Public community funnels for founder-shared links (YouTube/social/direct).
- Core member UX: join, navigate, post/chat, and voice.
- Billing and provider/account connections.
- Automated payouts for community builders (existing community payout flow).
- Community-scoped AI agent interactions embedded in community surfaces.
- Official Polynet MCP access for external agent harnesses.
- Tiered access and quota enforcement for AI usage.
- Existing thread and execution substrate retained only where current Polynet capabilities depend on it; it is not a standalone MVP destination.
- Ongoing `App.tsx` decomposition and cleanup required for launch stability.

---

## 2) Deferred (Must Not Expand During MVP)

- Affiliate system as a launch requirement.
- Automated affiliate payouts.
- Advanced automations/workflow depth beyond minimal alpha.
- Funnel builder.
- Standalone general-purpose personal-agent Workspace or multi-agent canvas.
- Public Apps and Skills catalogs inside Discover.
- Third-party MCP server catalogs, connections, mounts, credentials, and
  runtime tool projection inside Polynet. The official Polynet MCP provider
  remains in scope.
- Duplicate/legacy UI surfaces not required for MVP journeys.
- Extra inference-gating complexity beyond minimal tier limits.
- Nice-to-have platform expansions not directly improving creator setup + member participation.

---

## 3) Do-Not-Delete Platform Core

These are protected and must not be removed in MVP simplification passes:

- Member-facing personal-agent harness under explicit community context.
- Separate community-owned agent and cognition runtime.
- Community compiler and cognition.
- Community resources/memory systems.
- Official Polynet MCP.
- Required references and research context.

Coding, thread, project, workspace, and execution components are protected only
when a demonstrated first-party Polynet dependency makes them load-bearing.
Their existence does not restore the standalone Workspace product.

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

### Member Agent, Community Agent + External Harness Context
- The bottom-right dock is the member's personal agent under one explicit community context.
- Direct community-agent mentions and autonomous cognition use the separate community-owned agent identity.
- Native member-agent and community-agent interactions are bound to one explicit community context.
- External MCP requests select community context explicitly and server-validate it.
- Context changes affect subsequent turns only and never retroactively mutate stored history.
- Community context must fail closed if membership or entitlement is missing.
- Context used for each turn must be auditable from stored thread records/events.
- Threads and messages may remain internal persistence primitives without being user-facing navigation.

### Payments and Entitlements
- Redirects are UX only; provider/webhook verification is authoritative.
- `checkout_finalize` must remain idempotent.
- Access decisions are entitlement-driven and evaluated per request.
- Automated payouts for community builders remain active for MVP.

### Security and Tool Boundaries
- Web runtime cannot execute local filesystem/shell tools.
- Cloud tools are provider-bounded and approval-gated.
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

## 6.5) Canonical Release Workflow

- Active development worktree: `/Users/neilmcdevitt/code/arx`.
- Legacy workspace-provider worktree snapshots are historical only and are not canonical or active.
- Canonical Git release branch: `origin/main`.
- Canonical production app: Vercel project `polynet`.
- Legacy Vercel project `arx` is not a production target.
- For this repo, direct local Vercel release commands are forbidden.
- Do not run `vercel deploy`, `vercel --prod`, `vercel promote`, `vercel alias`, or `vercel rollback` as a release path for `polynet`.
- Normal web releases should land on `main` and let `polynet` deploy from GitHub.
- Convex production releases are explicit and should be run intentionally from the validated code state.
- Do not use direct local Vercel production deploys as a release path.
- Follow [/Users/neilmcdevitt/code/arx/docs/alpha-release-workflow.md](/Users/neilmcdevitt/code/arx/docs/alpha-release-workflow.md) for the operational runbook.

---

## 7) MVP Acceptance Checklist

All must be demonstrably true:

- Auth/session works across the canonical web surface.
- Founder can create/manage community and share funnel link.
- Member can discover/open funnel, pass gate, and join community.
- Community usage loop works: navigate, post/chat, voice, resources.
- Community-agent and external MCP context are explicit, authorized, and auditable.
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
