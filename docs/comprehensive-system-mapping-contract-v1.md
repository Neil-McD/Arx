# Comprehensive Polynet System Mapping Contract v1

- Status: active mapping contract; comprehensive static mapping authorized 2026-07-19; no implementation is authorized
- Scope: comprehensive, read-only architecture and technical-debt mapping from the isolated semantic-platform staging lane
- Primary objective: identify the irreducible Polynet MVP, its canonical authorities, and the safest order for deletion, consolidation, hardening, and later optimization

## 1. Decision

Polynet will be mapped with two intersecting passes:

1. **Bottom-up truth pass:** deployment and data -> authority -> state transitions -> side effects -> adapters -> product surfaces.
2. **Top-down journey pass:** MVP user journeys -> UI -> APIs and runtimes -> operations -> canonical state.

The passes must reconcile. A bottom-up-only audit can miss duplicate product flows. A top-down-only audit can miss orphaned tables, jobs, compatibility layers, and hidden authority.

This is not a request to create a hand-maintained ledger of every file, table, endpoint, or component. Mechanical inventory provides coverage; human-authored documents capture architectural meaning, contradictions, risks, and decisions. Code, schema, configuration, and runtime evidence remain the source of truth.

## 2. Safety Boundary

### 2.1 Verified starting lane

Verified on 2026-07-19:

| Boundary | Required value |
| --- | --- |
| Worktree | `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719` |
| Branch | `codex/semantic-platform-staging-20260719` |
| Staging Git commit | `67c89903add41ff9b8de20929e07429a8d98f3bc` |
| Vercel project | `polynet-staging` |
| Stable staging URL | `https://polynet-staging-neil-mcds-projects.vercel.app` |
| Convex staging deployment | `dev:quick-porcupine-949` |
| Production Git authority | `origin/main` |
| Production app | `https://www.polynet.ai` |
| Production commit at verification | `a936dee72a65f91723f332779390210e4cf783f0` |

Vercel reports the staging deployment's target as `production` because it is the production environment **inside the separate `polynet-staging` project**. That is not the Polynet production project.

### 2.2 Start gate for every mapping slice

Before reading deeply or generating evidence, prove all of the following:

1. The exact worktree and branch match this lane.
2. The worktree has no unexplained changes.
3. `HEAD` and its staging upstream are intentionally related and the exact difference is recorded.
4. `.vercel/project.json` points to `polynet-staging` with the expected project and organization IDs.
5. local Convex selectors resolve only to `dev:quick-porcupine-949`.
6. `POLYNET_DEPLOYMENT_KIND=staging`.
7. no production deploy key or production Convex selector is present.
8. the public staging and production version markers are recorded separately.
9. `scripts/semantic_platform_staging_guard.sh` and its behavioral proof pass.
10. any slice relying on authenticated runtime behavior has a separately verified staging session; public reachability is not treated as an authenticated product smoke.

If any identity is missing, ambiguous, or production-shaped, stop. Do not compensate by guessing.

### 2.3 Permitted activity

- read source, tests, contracts, configuration names, Git history, and generated types;
- run non-mutating static analysis, typecheck, builds, and existing proof scripts;
- make read-only requests to public staging endpoints;
- inspect staging data through explicitly read-only queries that return bounded, redacted aggregates;
- create mapping documents and immutable, commit-addressed inventory artifacts;
- record unknowns rather than resolving them through a mutation.

### 2.4 Prohibited activity during mapping

- no schema, data, code, UI, environment, provider, deployment, or branch-setting changes;
- no Convex mutations or actions with possible side effects;
- no webhooks, checkout, payouts, email sends, agent runs, external tool calls, or job triggers;
- no production data queries without a separate, explicit authorization and bounded query plan;
- no secret retrieval, printing, copying, or comparison by value;
- no deletion, migration, backfill, refactor, dependency upgrade, or opportunistic fix;
- no direct Vercel production release command;
- no cleanup of historical worktrees as a side effect of the audit.

Finding a defect does not authorize fixing it. It creates an evidence-backed finding.

## 3. Truth Model

Every claim must name which kind of truth supports it:

| Truth class | What it answers | Primary evidence |
| --- | --- | --- |
| Normative truth | What Polynet is required to be | current human direction, `AGENTS.md`, explicitly active contracts |
| Implementation truth | What the current snapshot can do | schema, validators, source, configuration, generated contracts |
| Runtime truth | What the selected environment actually does | build markers, bounded staging reads, logs, signed-in or unauthenticated smoke evidence |
| Regression truth | What behavior is mechanically defended | behavioral tests, proof scripts, typecheck, builds |
| Historical truth | Why a shape may exist | Git history, archived documents, migrations, old worktrees |

Normative and implementation truth must not be flattened together. A disagreement is drift to record, not an invitation to quietly choose one side.

Documents are claims unless their status, owner, corresponding executable boundary, and current verification evidence are clear. Generated indexes and projections are evidence aids, never new product authority.

## 4. Irreducible Mapping Model

The map uses a small graph vocabulary.

### 4.1 Node types

1. **Principal:** user, personal agent, community agent, system, or explicitly enrolled service identity.
2. **State:** canonical record, relationship, policy, entitlement, credential reference, or external provider state.
3. **Operation:** query, mutation, action, job, webhook transition, capability invocation, or external side effect.
4. **Boundary:** authorization resolver, validator, isolation boundary, API, MCP adapter, worker bridge, provider adapter, or deployment boundary.
5. **History:** event, receipt, audit record, message, outcome, or operational evidence.
6. **Projection:** UI view, prompt, Markdown resource, search index, compiled summary, API response, notification, or generated manifest.
7. **Requirement:** MVP invariant, security law, product rule, legal obligation, or protected platform core.

### 4.2 Edge types

Use explicit verbs: `owns`, `authorizes`, `reads`, `writes`, `projects`, `derives`, `invokes`, `emits`, `schedules`, `retries`, `settles`, `revokes`, `supersedes`, `duplicates`, and `depends_on`.

Every important operation must ultimately resolve:

```text
principal
  -> current authority
  -> validated operation
  -> canonical state or external effect
  -> durable event or receipt
  -> permissioned projection
```

Any bypass, second authority decision, unreceipted effect, or competing projection is a finding candidate.

## 5. Required Coverage

The program must account for these domains without assuming they deserve to survive:

1. repository topology, refs, worktrees, dependencies, supply-chain exposure, generated code, CI, and release paths;
2. environment configuration, feature flags, secrets boundaries, Vercel, Convex, workers, external hosts, backups, restore, and rollback;
3. identity, authentication, sessions, verification, account lifecycle, and operator authority;
4. users, profiles, personal memory, consent, privacy, retention, export, and deletion;
5. communities, ownership, membership, roles, blocks, visibility, gates, funnels, and onboarding;
6. entitlements, plans, usage accounting, checkout, subscriptions, Stripe Connect, refunds, disputes, commissions, and payouts;
7. community interactions, chat, posts, replies, reactions, mentions, DMs, presence, events, and notifications;
8. resources, source ingestion, content versions, provenance, evidence, compiler state, cognition, accepted intelligence, retrieval, and outcomes;
9. personal-agent, community-agent, model-routing, prompt, context, tool, capability, receipt, and failure-recovery paths;
10. native tools, external MCP, MCP consumption, apps, skills, OAuth, webhooks, and provider credentials;
11. workspace and thread substrate, coding/community harnesses, workers, terminals, previews, and compatibility adapters;
12. scheduled jobs, queues, outboxes, retries, leases, reconciliation, cleanup, and failure finalization;
13. public and authenticated APIs, Vercel adapters, Convex HTTP routes, browser/server boundaries, and rate limits;
14. frontend routing, navigation, data loading, caches, local state, access projections, duplicated components, CSS, accessibility, and mobile behavior;
15. observability, audit, diagnostics, logging, analytics, incident recovery, legal surfaces, and operational ownership;
16. tests, proof scripts, docs, archived contracts, migrations, seeds, fixtures, and reference repositories.

The coding harness, community harness, community compiler, community resources/memory systems, and `references/` folders are protected. Mapping them is allowed; proposing their deletion requires explicit human confirmation.

## 6. Execution Sequence

### Phase 0 — Reconcile doctrine and scope

Purpose: establish which requirements are normative before judging implementation.

1. Compare `AGENTS.md`, active docs, the semantic-platform thesis, product docs, and current user direction.
2. Mark each statement as active, superseded, historical, contradictory, or unclear.
3. Separate long-term architecture from MVP requirements.
4. Resolve only the source hierarchy; do not redesign the product during this phase.

Gate: no implementation classification begins while two active documents assign incompatible ownership or MVP status to the same concern.

### Phase 1 — Freeze and generate the mechanical snapshot

Purpose: achieve comprehensive coverage without a manual ledger.

Generate a commit-addressed inventory of:

- tracked files, languages, package boundaries, dependency direction, and code-generation outputs;
- Convex tables, fields, validators, indexes, scheduled functions, public/internal functions, and HTTP routes;
- API/Vercel routes, webhooks, workers, services, and provider adapters;
- frontend routes, entry components, data clients, and major state owners;
- scripts, checks, fixtures, seeds, migrations, archived docs, and explicit compatibility markers;
- imports, RPC references, string-dispatched handlers, environment-variable names, and deployment selectors.

Prefer AST/type-aware extraction where possible. Use text search as a secondary detector for dynamic registration, generated names, and string routing. Every generated artifact records the exact commit and tool version and is immutable after the snapshot moves.

Gate: every mechanically discoverable surface is accounted for by the inventory, but no claim of ownership or deadness is inferred from inventory alone.

### Phase 2 — Map canonical data and lifecycle

Purpose: determine what exists, which store owns it, and how it is born, changed, retained, and removed.

For every data domain:

1. group tables by business object rather than filename;
2. identify canonical records versus caches, indexes, receipts, queues, projections, and compatibility rows;
3. trace all first-party reads and writes;
4. identify required invariants, uniqueness, referential expectations, retention, redaction, and deletion behavior;
5. inspect indexes and query bounds;
6. identify external canonical state such as Stripe where applicable;
7. compare schema definitions with bounded staging data shape and generated types;
8. record dual-write, backfill, legacy-field, nullable-state, and orphan risks.

Gate: each business object has one stated canonical owner per concern, or a contradiction is recorded.

### Phase 3 — Map identity, authority, and invariants

Purpose: prove who may see or change each canonical concern.

Trace:

- authentication and session establishment;
- user, agent, community, operator, and service identities;
- membership, ownership, role, entitlement, delegation, and provider authority;
- public, visitor, pending, blocked, member, moderator, admin, and owner states;
- community context selection and reauthorization;
- billing/provider verification versus client redirects;
- privileged operations, destructive actions, and approval exceptions;
- row filtering, object-level checks, path isolation, and fail-closed behavior.

The model, client, path, manifest, prompt, or cached projection never grants authority.

Gate: every meaningful read, mutation, and external effect reaches one deterministic authority boundary, or the alternate path is recorded as drift.

### Phase 4 — Map operations and state transitions

Purpose: reconstruct behavior rather than merely catalog functions.

For each lifecycle, identify:

- valid states and transitions;
- initiating principal and entry surface;
- preconditions and target revision;
- transaction or concurrency boundary;
- idempotency and deduplication key;
- retry, timeout, partial-failure, and compensation behavior;
- emitted events and receipts;
- downstream projections and cache invalidation;
- terminal, stuck, and recovery states.

Gate: all money, access, identity, deletion, publishing, and agent-action transitions have deterministic recovery semantics or an explicit gap.

### Phase 5 — Map asynchronous and external effects

Purpose: find reliability and scaling risks hidden outside request/response paths.

Cover scheduled jobs, leases, outboxes, email, webhooks, source crawls, compiler/cognition cycles, workers, model/provider calls, file or preview infrastructure, Stripe, OAuth providers, and any other external system.

For each effect, record delivery semantics, concurrency control, retry policy, idempotency, reconciliation owner, observability, rate bounds, cost bounds, and shutdown/recovery behavior.

Gate: no external effect is considered reliable solely because its initiating request succeeded.

### Phase 6 — Map semantic, capability, agent, and MCP kernels

Purpose: locate duplicate declarations and prove adapter parity without flattening intentional cognition complexity.

Map separately:

1. semantic namespace identity, mounts, renderers, list/read/search adapters, bounds, and authorization hooks;
2. capability identity and version, schemas, valid targets, required authority, effects, retries, executor, and receipt shape;
3. prompt/context assembly, manifest projection, tool exposure, dispatch, and runtime receipts;
4. native member-agent, community-agent, external MCP, Codex/worker, workflow, API, and UI projections;
5. raw evidence, canonical resources, candidate knowledge, accepted intelligence, retrieval, and outcome lanes.

Gate: duplicate wire adapters may remain, but duplicate semantic truth, capability authority, execution, or receipt ownership is a finding.

### Phase 7 — Map adapters and public boundaries

Purpose: prove that transport layers delegate rather than invent product truth.

Trace browser clients, Vercel functions, Convex HTTP routes, webhooks, MCP transports, service workers, and provider adapters to their canonical operations. Record validation order, authentication, authorization, rate limiting, request bounds, error normalization, caching, and audit behavior.

Gate: every public boundary has an explicit input contract, authority path, bounded work policy, and failure response.

### Phase 8 — Trace MVP journeys end to end

Required vertical journeys:

1. auth, session refresh, logout, and account deletion;
2. founder creates and manages a community;
3. founder publishes or shares the canonical funnel;
4. visitor discovers or opens a funnel, passes the gate, and joins;
5. member navigates, posts/chats, replies/reacts, uses voice, reads resources, and manages membership;
6. personal agent acts under one explicit community lens;
7. community-agent mention and autonomous cognition remain separate identities and authority modes;
8. external harness selects and accesses a community through official MCP;
9. paid access, entitlement convergence, refunds/disputes, and builder payout readiness;
10. app/skill connection and authorized projection;
11. protected coding/community harness and workspace compatibility paths.

Each journey must reconcile UI, adapter, operation, authority, state, external effects, receipts, and recovery.

Gate: no deferred or duplicate surface is required to complete a primary MVP journey unless explicitly recorded as a current blocker.

### Phase 9 — Map the frontend last

Purpose: distinguish true UI complexity from complexity inherited from unresolved backend ownership.

Map route ownership, authenticated destinations, navigation, server/client authority decisions, remote versus local state, duplicated loaders, caches, compatibility views, component boundaries, styling systems, accessibility, mobile variants, bundle concentration, and error/retry UX.

Large files are signals, not automatic refactor requirements. Decompose only after obsolete surfaces and duplicate state ownership are identified.

Gate: every retained UI surface projects a retained journey and canonical backend concern.

### Phase 10 — Apply cross-cutting quality lenses

Evaluate every domain through:

- **simplicity:** number of authorities, paths, states, adapters, and concepts required for one job;
- **security:** identity, authorization, isolation, injection, secret handling, audit, and fail-closed behavior;
- **reliability:** idempotency, retries, ordering, convergence, reconciliation, and recovery;
- **robustness:** invalid state, partial failure, stale clients, provider outage, version skew, and destructive-action safety;
- **scalability:** query bounds, scans, fan-out, N+1 work, payload/context size, scheduler frequency, concurrency, storage growth, and provider cost;
- **performance:** critical-path latency, redundant reads/renders, caching correctness, bundle size, and context/token efficiency;
- **maintainability:** coupling, cycles, duplication, naming drift, generated/manual parity, test brittleness, and ownership clarity;
- **observability:** ability to distinguish failure, latency, denial, retry, data drift, and release mismatch without exposing private content.

Robustness also includes backup integrity, restore procedures, deployment rollback, dependency or provider version skew, and the ability to recover from a region, worker, scheduler, or third-party outage.

For complexity claims, state the relevant input variable and expected order, such as `O(messages)`, `O(members × resources)`, or unbounded fan-out. Do not use “scalable” as an unsupported adjective.

### Phase 11 — Synthesize the reduction roadmap

Order findings by causal depth:

1. conflicting requirements or competing canonical authorities;
2. security, identity, access, money, and irreversible data risks;
3. invalid lifecycle, unbounded work, missing idempotency, and recovery gaps on MVP paths;
4. duplicated implementations and compatibility layers that amplify change cost;
5. observability and proof gaps that prevent safe deletion;
6. frontend surface deletion and state simplification;
7. decomposition and optimization of what remains;
8. acceleration and automation only after simplification.

The first implementation slice must be the smallest change that removes a causally upstream contradiction and can be behaviorally proven in staging.

## 7. Evidence Standard

Every non-trivial conclusion must include:

1. exact snapshot commit and environment;
2. file, symbol, route, table, index, or runtime evidence;
3. whether the evidence is static, staging-runtime, production-runtime, behavioral proof, or historical;
4. known consumers and producers;
5. confidence: `confirmed`, `strongly inferred`, or `unknown`;
6. the cheapest test that could falsify the conclusion.

Structural proof scripts count only as structural evidence. A regex guard cannot prove runtime behavior, authorization, idempotency, scale, or recovery unless the behavior is actually exercised.

Staging data inspection should prefer counts, state distributions, age distributions, orphan counts, and bounded redacted samples. Never copy raw private content into the map.

## 8. Domain Dossier Template

Each durable domain map must answer:

1. What irreducible product job does this domain perform?
2. Is that job required by MVP, protected core, deferred, or unclear?
3. Which principal or institution owns the data and decisions?
4. What is canonical, external-canonical, derived, operational, cached, compatibility-only, or historical?
5. Which tables, indexes, validators, functions, routes, jobs, adapters, and UI surfaces participate?
6. Which reads, writes, side effects, and first-party call paths are live?
7. Where is authority resolved and revalidated?
8. Which invariants must always hold?
9. What are the lifecycle, retry, idempotency, reconciliation, and deletion semantics?
10. What is unbounded, high fan-out, expensive, slow, or likely to grow fastest?
11. Which other implementation claims the same truth or job?
12. What fails open, fails ambiguously, or cannot recover deterministically?
13. Which tests and runtime signals prove the path?
14. Which claims remain unknown, and what bounded evidence would resolve them?
15. What should be kept, deleted, consolidated, migrated, hardened, observed, or explicitly decided?
16. What capacity, latency, availability, cost, recovery, and data-growth assumptions does the domain make?

## 9. Candidate Classification

Every finding receives one primary classification required by the MVP contract:

- `KEEP (MVP core)`
- `DELETE (deferred/dead)`
- `DECISION REQUIRED (user confirmation)`

It may also receive an action tag: `CONSOLIDATE`, `MIGRATE_THEN_DELETE`, `HARDEN`, `BOUND`, `REWRITE_PROOF`, `DOCUMENT`, `OBSERVE_FIRST`, `VERSION`, `RETENTION`, `PROVE`, `DELETE_FIRST`, or `DECOMPOSE_LATER`.

### 9.1 Idiot index

Rate each retained requirement from 0 to 10:

- `0–2`: physically or contractually necessary for the irreducible product;
- `3–5`: useful but potentially over-specified or duplicative;
- `6–8`: weakly justified, legacy-shaped, or cheaper to eliminate than maintain;
- `9–10`: no current first-party need, competing truth, or bureaucracy masquerading as architecture.

The score must include a one-sentence reason and the named owner of the requirement. A high score is a prompt to challenge or delete the requirement, not permission to delete code or data.

### 9.2 Minimum deletion evidence

No deletion candidate is ready for implementation until all are true:

1. no required MVP or protected-core responsibility depends on it;
2. no active first-party call path requires it;
3. no live data, scheduled job, webhook, provider, or compatibility consumer remains unexplained;
4. canonical replacement truth exists and is behaviorally proven;
5. data migration, retention, legal, rollback, and observability implications are understood;
6. related docs, generated contracts, tests, environment settings, and operational procedures are included in the proposed slice;
7. explicit human confirmation exists for protected or ambiguous scope.

## 10. Durable Outputs

The later mapping program should produce:

```text
docs/system-map/
├── README.md                       # current status and navigation
├── 00-snapshot-and-truth.md        # exact refs, environments, tools, and evidence limits
├── 01-normative-contract-drift.md  # active, superseded, contradictory, unknown
├── 02-canonical-authority-graph.md # owners, state, operations, history, projections
├── domains/                        # one bounded dossier per product domain
├── journeys/                       # end-to-end MVP traces
├── findings.md                     # evidence-backed candidate register
├── unknowns.md                     # unresolved questions and falsification probes
└── roadmap.md                      # dependency-ordered implementation slices
```

Machine-generated inventories live under a commit-addressed snapshot directory and state plainly that they are non-canonical evidence. They should be regenerated, not manually edited. Durable prose should link to evidence rather than duplicate source code.

The findings register contains findings only—not one row for every table, function, route, or component.

## 11. Review Gates

1. **Boundary gate:** staging identity and read-only rules pass.
2. **Doctrine gate:** normative contradictions are explicit.
3. **Coverage gate:** mechanical inventory accounts for the repository surface.
4. **Authority gate:** canonical owners and authorization paths are explicit or marked unknown.
5. **Lifecycle gate:** critical transitions and external effects include failure and recovery.
6. **Journey gate:** MVP paths reconcile from UI to canonical state and back.
7. **Quality gate:** simplicity, security, reliability, robustness, scale, performance, maintainability, and observability were evaluated.
8. **Decision gate:** every candidate has evidence, classification, dependencies, reversibility, and a smallest safe validation slice.

Do not begin implementation at a failed gate. Finish the evidence or ask for the missing decision.

## 12. Definition of Complete

The system map is complete enough to drive work when:

1. all 16 required coverage domains have a named dossier or an explicit non-applicability proof;
2. every schema table, callable backend function, public route, scheduled job, worker boundary, and frontend route is mechanically assigned to a domain and role;
3. every MVP journey is traced through authority, canonical state, effects, receipts, projection, and recovery;
4. all competing sources of truth and duplicate implementations are listed with evidence;
5. unbounded and superlinear work is named with its scaling variable and execution frequency;
6. security and privacy boundaries are mapped from principal to data/effect;
7. live-data uncertainty is separated from source-code certainty;
8. every deletion candidate satisfies the minimum evidence standard or is marked `OBSERVE_FIRST`;
9. unknowns and contradictory evidence remain visible;
10. the roadmap starts with causal, high-risk simplification and ends with frontend cleanup and optimization;
11. no production state or configuration was changed by the mapping program;
12. a new agent can resume from the documents using exact refs and evidence without reconstructing the audit from chat history.

## 13. Commissioning Observations

These observations size the work; they are not completed mapping conclusions:

- the current snapshot contains 125 Convex tables;
- the tracked product source surfaces contain 797 files and 324,480 lines;
- `package.json` exposes 247 `check:*` scripts, so proof ownership and redundancy require mapping alongside product code;
- `apps/web/src/App.tsx` is approximately 12,000 lines and `apps/web/src/base.css` approximately 35,000 lines, confirming that frontend work must follow surface and ownership decisions;
- local `main` is 23 commits behind `origin/main`, while the staging worktree and remote staging branch currently match exactly;
- Git retains many prunable historical worktree records; this is operational hygiene debt but does not contaminate the isolated staging lane;
- the current active-doc index, MVP contract, irreducible-core contract, and semantic-platform thesis contain status and scope differences that must be reconciled in Phase 0;
- the expanded semantic-platform thesis supplied in the planning discussion is not identical to the current staging file, so it must not silently replace repository doctrine.
- the public staging surface, public auth metadata, and fail-closed unauthenticated MCP boundary are proven, but a signed-in staging member journey has not yet been established; static phases may proceed, while authenticated runtime conclusions must wait for that evidence.

## 14. Authorized Mapping Scope

The first identity/community/access slice was approved and completed on 2026-07-19. The user then explicitly authorized expanding the same read-only program to map the whole system, identify duplicate, stale, legacy, and deletion candidates, and rank requirements on the idiot index.

This authorization covers static inspection, non-mutating proofs, generated inventory, domain and journey dossiers, candidate classification, and a dependency-ordered roadmap. It still authorizes no code, schema, data, environment, deployment, provider, or product change. Live-data prevalence and signed-in behavior remain separate evidence slices.
