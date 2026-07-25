# Domain Dossier — Workspace/Harness, Runtime, and Asynchronous Operations

## Irreducible boundary

The coding harness, community harness, worker/runtime, terminals, previews, project/thread persistence, and provider isolation are protected. The standalone general-purpose Workspace destination is deferred. The correct simplification is therefore **hide/retire duplicate destination state while preserving bounded capability substrate**.

## Workspace and thread substrate

Schema and runtime modules own projects, threads/messages/attachments, runs/events, terminals, previews, runtime sessions, credits, provider leases, and failure receipts. Web runtime cannot directly execute local filesystem/shell tools. Worker/provider operations enforce root/path and symlink boundaries, use explicit session identity, and emit runtime evidence. These are strong invariants worth retaining.

The UI route state is contradictory:

- builders still generate `/workspace`, `/workspace/:slug`, and `/workspace/thread/:id` paths;
- workspace controllers set `activePage` to `workspace` and navigate to those paths;
- `parseAppRouteFromPathname` maps ordinary `/workspace*` paths back to `page: "landing"`, except selected legacy setup redirects.

This is a split client state machine: in-memory navigation can enter Workspace while refresh/deep link resolves elsewhere. It is evidence that the destination was partially retired without closing callers and types.

`WebWorkspaceHost.tsx` remains a large product host and even embeds the Builder Partner panel. Builder Partner is retained, but as a secondary Settings/operator capability; coupling it to the protected Workspace host has nothing to do with harness capability.

## Scheduled job inventory

Most money/outbox/runtime cleanup jobs use indexes, explicit limits, leases,
retry state, or idempotency. One fairness family remains:

1. weekly digest and recurring reminder selection have bounded prefixes but no durable continuation/partition ownership.

Community memory no longer has a fairness scan. Canonical trace writes schedule
compiler mutations, and each new immutable digest owns one exact recovery
checkpoint around its at-most-once heartbeat action.
The reaction-ranked AI Feed and its global automatic-prune scan are deleted;
the retained feed is a bounded newest-first agent-publication stream.

Bounded cost is necessary but insufficient. A repeating prefix scan without continuation is not eventually complete.

## Async reliability model

Every retained queue/job needs:

```text
indexed eligibility -> stable partition/cursor -> lease or idempotency key
-> bounded effect -> durable result/retry state -> dead-letter/operator signal
-> proof that all eligible keys eventually receive service
```

The email outbox, mention repair, link previews, credit reservations/settlements, and many runtime finalizers already demonstrate parts of this pattern.

## Complexity and cost

| Surface | Scaling variable | Risk |
| --- | --- | --- |
| compiler digest recovery | unfinished digest versions | `O(1)` exact-row checkpoint per active recovery chain |
| Workspace UI orchestration | app state/callback surfaces | large coupling and refresh-state drift, not merely line count |
| runtime events/receipts | runs × events | storage retention and operator query cost unclear |
| provider workers/previews | sessions × time/cost | needs cleanup, lease finalization, and accounting convergence |

## Reduction candidates

| Candidate | Classification | Action | Idiot index | Rationale |
| --- | --- | --- | ---: | --- |
| protected coding/community harness substrate | `KEEP (MVP core)` | `HARDEN` | 1 | explicitly protected and required for external execution |
| standalone Workspace as primary navigation destination | `DELETE (deferred/dead)` | `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | 9 | current MVP selects communities; callers/compatibility must be enumerated |
| Workspace host coupling to Builder Partner UI | `DELETE (deferred/dead)` | `MIGRATE_THEN_DELETE` | 9 | retained secondary economy is misplaced inside a protected execution surface |
| workspace route builders/controllers after parser retirement | `DECISION REQUIRED (user confirmation)` | `MIGRATE_THEN_DELETE` | 8 | split state machine; backend substrate is not the same as destination routing |
| remaining no-cursor repeating prefix sweeps | `KEEP (MVP core)` | `HARDEN`, `BOUND` | 9 | claims reliable automation while permanently starving eligible work |
| durable runtime receipts | `KEEP (MVP core)` | `RETENTION`, `BOUND` | 2 | necessary for audit/recovery, but not forever at full fidelity |

## Closure rule

Do not delete workspace tables/functions just because the destination is deferred. First classify every path as protected execution substrate, migration compatibility, or standalone UI. Remove only the third class and adapters proven unused; then decompose the retained host/runtime around capability boundaries.
