# Polynet System Map

Status: comprehensive static map and bounded redacted staging-shape audit complete at commit `67c89903add41ff9b8de20929e07429a8d98f3bc`; signed-in behavior, provider convergence, external consumers, and production remain unqueried.

This directory is evidence and analysis, not product authority. Schema, executable authorization boundaries, runtime behavior, and the current MVP contract remain authoritative for their respective truth classes. Nothing in this map authorizes a code, schema, data, configuration, deployment, migration, or deletion change.

## What this map establishes

1. All 1,292 tracked files, 125 schema tables, 789 directly registered Convex functions, 238 alias candidates, 36 Convex HTTP routes, 13 Vercel API route files, and 23 scheduled jobs are mechanically assigned to a domain.
2. The 16 required coverage domains are reconciled through eight bounded dossiers and one coverage/topology matrix.
3. Eleven MVP journeys are traced from surface to authority, canonical state, effects, receipts, and known recovery gaps.
4. Competing truths, duplication, scale risks, destructive lifecycle defects, deferred surfaces, stale configuration, proof gaps, and deletion candidates are recorded in one findings register.
5. The idiot index challenges exact requirements and compatibility burdens; it never grants deletion authority.

The map is source-comprehensive, not runtime-complete. A later bounded staging audit inspected aggregate state distributions only; it returned no private content or identifiers. It did not execute authenticated journeys, invoke external providers, or mutate anything. Remaining runtime uncertainty stays explicit.

## Navigation

- [`00-snapshot-and-truth.md`](00-snapshot-and-truth.md): exact refs, environments, evidence, and limits.
- [`01-normative-contract-drift.md`](01-normative-contract-drift.md): source hierarchy and doctrine contradictions.
- [`02-canonical-authority-graph.md`](02-canonical-authority-graph.md): cross-system canonical ownership and projection graph.
- [`03-coverage-and-topology.md`](03-coverage-and-topology.md): all 16 coverage domains, repository topology, and concentration.
- [`04-staging-shape-audit-20260720.md`](04-staging-shape-audit-20260720.md): bounded redacted staging distributions and candidate-status changes.
- [`05-decisions-builder-partner-and-data-ownership.md`](05-decisions-builder-partner-and-data-ownership.md): accepted product direction, remaining financial inputs, and revised causal order.
- [`06-authenticated-identity-session-completion-20260720.md`](06-authenticated-identity-session-completion-20260720.md): F-001/F-003–F-005 end state, migration receipt, executable proof, and 8/10 score contract.
- [`domains/identity-community-access.md`](domains/identity-community-access.md): identity, sessions, communities, membership, and access.
- [`domains/privacy-account-lifecycle.md`](domains/privacy-account-lifecycle.md): profiles, consent, shared ownership, account and community deletion.
- [`domains/billing-money.md`](domains/billing-money.md): payment authority, community revenue, entitlements, credits, Builder Partner commissions, and payouts.
- [`domains/interactions-communications.md`](domains/interactions-communications.md): canonical interactions, legacy chat, DMs, events, email, and notifications.
- [`domains/resources-intelligence.md`](domains/resources-intelligence.md): resources, ingestion, evidence, compiler, memory, accepted intelligence, retrieval, and outcomes.
- [`domains/agents-tools-apps-mcp.md`](domains/agents-tools-apps-mcp.md): member/community agents, native tools, official MCP, apps, skills, and OAuth.
- [`domains/workspace-runtime-async.md`](domains/workspace-runtime-async.md): protected harness substrate, workers, terminals, runtime evidence, crons, queues, and fairness.
- [`domains/frontend-public-operations.md`](domains/frontend-public-operations.md): routes, public boundaries, frontend state, observability, CI, dependencies, docs, and release.
- [`journeys/mvp-journeys.md`](journeys/mvp-journeys.md): required vertical journey reconciliation.
- [`findings.md`](findings.md): evidence-backed candidate register.
- [`idiot-index.md`](idiot-index.md): ranked requirements and deletion queue.
- [`unknowns.md`](unknowns.md): unresolved questions and cheapest safe falsification probes.
- [`roadmap.md`](roadmap.md): causal reduction sequence and implementation gates.
- [`snapshots/67c89903/inventory.json`](snapshots/67c89903/inventory.json): generated static inventory.
- [`snapshots/67c89903/domain-coverage.json`](snapshots/67c89903/domain-coverage.json): generated domain assignment.
- [`tools/generate-inventory.mjs`](tools/generate-inventory.mjs) and [`tools/assign-domains.mjs`](tools/assign-domains.mjs): read-only generators.
- [`../comprehensive-system-mapping-contract-v1.md`](../comprehensive-system-mapping-contract-v1.md): governing method and review gates.

## Reading rules

- `confirmed`: directly supported by the frozen source or a successful deterministic proof.
- `strongly inferred`: the source path is clear, but the relevant live data or failure mode was not exercised.
- `unknown`: bounded staging evidence or a behavioral test is still required.
- Structural guards prove source shape only. They do not prove live authorization, recovery, scale, or provider behavior.
- `KEEP`, `DELETE`, and `DECISION REQUIRED` classify the exact requirement or candidate named in a row—not an entire neighboring subsystem. For Builder Partner, `KEEP` means retained secondary capability; it does not make the program a primary MVP journey or launch gate.
- “No first-party reference found” means the static snapshot found none; it does not prove that an external client, live row, scheduled provider, or operator procedure does not exist.

## Regeneration

Run from this exact worktree and commit:

```bash
node docs/system-map/tools/generate-inventory.mjs "$PWD" docs/system-map/snapshots/67c89903/inventory.json
node docs/system-map/tools/assign-domains.mjs docs/system-map/snapshots/67c89903/inventory.json docs/system-map/snapshots/67c89903/domain-coverage.json
jq -e '.snapshot.head == "67c89903add41ff9b8de20929e07429a8d98f3bc"' docs/system-map/snapshots/67c89903/inventory.json
```

The snapshots are generated from `git ls-files`; untracked mapping artifacts are intentionally excluded from source counts. Once committed, regenerate into a new commit-named directory rather than editing generated JSON by hand.
