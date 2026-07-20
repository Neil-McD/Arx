# 01 — Normative Contract Drift

## Resolved source hierarchy

For this mapping program, requirements are interpreted in this order:

1. Current explicit user direction plus `AGENTS.md` define the current MVP boundary and execution constraints.
2. `PLATFORM.md` defines durable platform doctrine where it is compatible with that MVP boundary.
3. Explicitly active domain contracts govern their bounded domain only where they do not contradict levels 1–2 and current executable authority.
4. Schema, source, generated types, tests, and runtime evidence describe implementation truth; they do not silently redefine the product target.
5. `docs/product/` is the user/LLM-facing projection. Its own index says it is downstream and must be corrected when it conflicts with platform doctrine or runtime contracts (`docs/product/README.md:13-22`).
6. `SOUL.md` governs voice and behavior, not data ownership or MVP scope.
7. `docs/agent-native-semantic-platform-thesis.md` is long-term direction, explicitly not an active implementation contract (`:3`).
8. The expanded thesis in the attached planning transcript is decision input only. It differs materially from the repository thesis and cannot become authority without an explicit adoption decision and repo change.

This hierarchy resolves how to map the current snapshot. It does not resolve every product choice and does not authorize implementation.

## Doctrine register

| ID | Claim/surface | Status | Evidence | Mapping conclusion |
| --- | --- | --- | --- | --- |
| N-001 | Communities, gated funnels, auth/session, core interaction, billing/entitlement, member agent, community agent, and MCP are MVP | active | `AGENTS.md:20-43` | Normative keep boundary. |
| N-002 | Workspace/thread infrastructure remains migration substrate, not the primary destination | active | `AGENTS.md:42,94`; thesis `:184-211` | Infrastructure may remain; destination doctrine must not depend on Workspace. |
| N-003 | Product workspace/thread docs describe a current thread-centered personal Workspace destination | contradictory downstream projection | `docs/product/primitives/workspace.md:13-45`; `thread.md:13-73`; manifest entries marked `alpha-current` | Product docs drift from N-002 and need a later bounded correction after retained compatibility behavior is named. |
| N-004 | Community-agent cognition contract is planned architecture | stale index label | `docs/README.md:20-21` versus contract status `active architecture; core runtime boundary implemented` at `docs/community-agent-cognition-contract-v1.md:3` | The index understates current status; protected cognition work must not be judged from the index label. |
| N-005 | Project-bound workspace tools are non-negotiable MVP | unclear scope | `docs/irreducible-core-contract.md:16,42` versus `AGENTS.md:42,53` | Compatible only if it means protected compatibility/harness capability, not a standalone Workspace destination. Human wording decision required before retirement or expansion. |
| N-006 | Semantic filesystem/registries/five-tool protocol are active implementation architecture | not adopted in this snapshot | repo thesis `:3,180-195`; attached transcript uses a different, expanded `active architecture thesis` | Do not use the attachment to classify current code. Adoption is a separate decision. |
| N-007 | Product docs are currently verified product truth | stale-risk, not blanket-invalid | `docs/product/README.md:5-6` last verified `2026-04-26` | Validate each claim against higher doctrine and implementation; do not delete the corpus wholesale. |
| N-008 | Builder Partner is retained, but is not a primary MVP journey or launch gate | resolved product direction; repository contract update pending | current explicit user direction retains the capability under prospective 4% community-only economics; `AGENTS.md:49-50` still defers it as a launch requirement; current implementation includes 5% community and paid-tool economics plus primary-surface coupling | Keep the system and payout evidence, demote its prominence, remove paid-tool eligibility, migrate new community commissions prospectively to a versioned 4% policy, and preserve old obligations under their original policy. |
| N-009 | Public Apps and Skills catalogs belong in Discover | deferred | `AGENTS.md:57`; current `WebDiscoverPanel` is communities-only | Private apps, skills, mounts, and MCP are retained; Discover marketplace presentation residue is not. |
| N-010 | Existing thread/workspace infrastructure may be deleted because the standalone destination is deferred | false | `AGENTS.md:42,67-72` | Retain protected substrate and migration compatibility; challenge only user-facing destination routes and duplicate adapters. |
| N-011 | Community resources, memory, compiler, cognition, and harnesses are cleanup targets | protected | `AGENTS.md:62-72` | Audit and simplify internal compatibility, but deletion of the protected capability requires explicit human confirmation. |

## Candidate classifications

| Exact candidate | Classification | Action tag | Idiot index | Reason and requirement owner |
| --- | --- | --- | ---: | --- |
| Workspace as a primary product destination claim | `DELETE (deferred/dead)` | `DOCUMENT`, `MIGRATE_THEN_DELETE` | 9 | Current user/`AGENTS.md` explicitly selects communities as the destination; retain only the required substrate and compatibility behavior. Owner: MVP contract. |
| Workspace/thread persistence substrate | `KEEP (MVP core)` | `DOCUMENT` | 2 | It remains necessary for migration, auditable context, and protected harness compatibility, even if hidden from navigation. Owner: platform/runtime. |
| Community cognition/compiler contract and implementation | `KEEP (MVP core)` | `DOCUMENT` | 1 | Explicitly protected and required for separate community-agent cognition. Owner: community intelligence. |
| Expanded semantic-platform thesis as present-day authority | `DECISION REQUIRED (user confirmation)` | `DOCUMENT` | 5 | Direction is valuable but materially broader and differently statused than the repository thesis. Owner: product architecture. |
| Project-bound workspace tools as a user-facing MVP surface | `DECISION REQUIRED (user confirmation)` | `DOCUMENT` | 7 | The active documents do not define whether “must keep” means capability substrate or destination surface. Owner: protected harness/MVP. |
| Builder Partner as a secondary growth capability | `KEEP (MVP core)` | `DOCUMENT`, `HARDEN`, `CONSOLIDATE` | 2 | Current direction explicitly retains it, while excluding it from primary MVP journeys. Owner: product/finance. |
| paid-tool Builder Partner commission eligibility | `DELETE (deferred/dead)` | `MIGRATE_THEN_DELETE` | 10 | Current direction explicitly removes this revenue stream; historical ledger evidence remains immutable. Owner: product/finance. |
| 5% as the prospective Builder Partner community-revenue rate | `DELETE (deferred/dead)` | `MIGRATE_THEN_DELETE`, `VERSION` | 8 | New eligible commissions move to 4%; previously earned rows retain their original policy. Owner: product/finance/legal. |
| Builder Partner in primary Workspace/onboarding/headline flows | `DELETE (deferred/dead)` | `MIGRATE_THEN_DELETE` | 9 | Retain a coherent secondary Settings/operator flow, not primary-product coupling. Owner: MVP product. |
| Private app/skill/MCP capability | `KEEP (MVP core)` | `HARDEN`, `CONSOLIDATE` | 1 | Required for authorized community context and external harness access. Owner: platform capabilities. |
| Public Apps/Skills Discover marketplace presentation residue | `DELETE (deferred/dead)` | `OBSERVE_FIRST` | 9 | Discover is communities-only and no active component reference was found for the legacy CSS surface. Owner: frontend MVP. |

## Phase 0 gate

The mapping gate passes because the source hierarchy is explicit and contradictions remain visible. Builder Partner and shared-data ownership are now decisioned for planning, but behavior, terms, and the repository MVP contract have not changed. The implementation gate still requires separately approved slices for those migrations, product-doc changes, Workspace surface retirement, and semantic-thesis adoption.
