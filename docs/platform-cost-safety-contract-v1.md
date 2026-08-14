# Platform Cost Safety Contract v1

## Purpose

Polynet must remain available when traffic grows, when a client misbehaves, and
when an internal retry or scheduled worker gets stuck.

The irreducible invariant is:

> No single client, tab, request, job, deployment, account, or community may
> exhaust shared platform infrastructure spend.

This contract governs infrastructure cost safety. It complements the product
accounting system; it does not replace founder-funded model and tool receipts.

## Authority Boundaries

| Concern | Canonical authority |
| --- | --- |
| Product state, access, and entitlements | Convex domain records and authorization functions |
| Founder-funded AI and tool usage | `founderUsageCycles`, usage receipts, and `providerCostEntries` |
| Convex/Vercel/provider invoices and spend limits | The corresponding provider |
| Product-side cost evidence | Bounded, redacted diagnostics derived from provider and runtime evidence |
| Emergency containment | Deterministic, named controls owned by the affected subsystem |
| Operator decisions | The human operator, supported by evidence |

Redirects, UI state, agent conclusions, and scheduled-agent prose are never
cost authority.

## Scope

This contract covers four cost domains:

1. **Convex:** function calls, database reads/writes, actions, file storage,
   bandwidth, vector operations, and scheduled work.
2. **Vercel:** builds, functions, bandwidth, image optimization, and public HTTP
   traffic.
3. **AI and tool providers:** inference, search, crawl/browser, transcription,
   email, and workspace providers.
4. **Staging and test:** preview deployments, staging backends, canaries, test
   data, and reconnecting or stale clients.

Out of scope:

- broad business analytics;
- speculative cost optimization without measured evidence;
- an LLM independently deciding to disable production;
- a second accounting ledger parallel to canonical provider-cost receipts.

## Principles

1. **Delete first.** Remove unnecessary polls, crons, retries, projections, and
   compatibility paths before optimizing them.
2. **Bound every repetition.** Recurring work needs a cadence, scope bound,
   cleanup path, and concurrency guard.
3. **Pay for change, not observation.** Prefer event-driven projections over
   repeatedly rebuilding state from historical rows.
4. **Growth is allowed; amplification is not.** Limits should isolate abusive or
   defective actors without imposing a global traffic ceiling.
5. **Fail closed at money and permission boundaries.** Provider usage must be
   admitted before execution and settled from durable evidence.
6. **Provider controls are the last backstop.** Product controls reduce waste;
   provider budgets and alerts prevent an application defect from becoming an
   unlimited bill.
7. **Automation earns authority gradually.** Monitor first, then recommend,
   then invoke only explicitly approved and reversible controls.

## Cost-Safety Requirements

Every cost-bearing repeated operation must declare:

- owner and purpose;
- trigger and cadence;
- unit of isolation (`request`, `session`, `user`, `community`, or deployment);
- maximum batch/concurrency/retry/time bounds;
- empty-run behavior;
- idempotency or lease behavior where side effects occur;
- the evidence used to measure cost and failure;
- a named, reversible containment mechanism;
- a proof that cleanup and bounds survive remount, reconnect, resume, and retry.

New undeclared recurring cost-bearing work is forbidden.

## Ground Truth Baseline

Grounded on 2026-08-13 against production and `origin/main` commit
`4a32c17fc4a1a4e1216d67038f2dbfbcbbe9120e`.

### Incident evidence

- Staging emitted 398 `profiles:getProfileDetailByUserId` calls in 15.44
  seconds (25.77 calls/second).
- Production emitted 426 calls in 90.9 seconds (4.69 calls/second).
- The repeated calls primarily reused the same cached execution timestamp,
  consistent with client-side subscription/hydration amplification rather than
  real user demand.
- Production commit `91b7111b` removed redundant self-profile hydration,
  retired an obsolete provider-connections query, and added render-churn
  regression coverage.
- A later log sample did not show a continuing profile-call spike. This proves
  containment of the observed incident, not platform-wide cost safety.

### Current cost-bearing recurring-work inventory

#### Persistent client work

| Operation | Trigger/cadence | Current bounds | Status / required action |
| --- | --- | --- | --- |
| Community attention subscription | one pooled realtime transport with query subscriptions chunked to 25 communities per backend query | no fixed poll, no manual post-mutation refresh, and every execution is scope-bounded | `implemented; staging proof pending`: measure reactive update reads before deciding whether a stored head projection is justified |
| Active-community presence | mount, resume, and every 30 seconds while visible | one in-flight call; 90-second lease; scan limit 64 | `keep, verify`: behavior is bounded; prove one effective lease per actor/community across multiple tabs |
| Founder checkout reconciliation | 1.5-second polling after checkout | canceled on teardown; route-specific | `keep, prove`: bounded commercial recovery must have an explicit attempt/time cap on every branch |
| Checkout finalization | delayed retries after provider redirect | centralized timeout ref and terminal attempt rules | `keep, prove`: idempotent finalization is required; no indefinite retry |
| Public Builder purchase attachment | 750-ms bounded post-auth checks | finite loop | `keep, prove`: commercial recovery only |
| Pending-purchase auto-redemption | delayed post-auth retries | six attempts with increasing delay | `keep`: bounded and tied to an unresolved purchase |
| Convex realtime authentication | reconnect re-authentication | one shared transport per deployment and actor; finite auth retry budget; terminal provider state retires the transport until explicit session recovery | `implemented; staging proof pending`: prove a disabled deployment produces one failed subscription burst followed by zero recurring calls |

One-second elapsed-time and typing-expiry display timers do not call a backend
and are excluded. Focus/animation/toast/image-cleanup timers are also excluded.
Preview metrics are event-driven through load, resize, `ResizeObserver`, and
`MutationObserver`; their redundant 1.2-second fixed timer is retired.

#### Fixed-interval source inventory

CI admits exactly these six first-party `setInterval` call sites:

| Canonical call site | Classification | Required lifetime bound |
| --- | --- | --- |
| `apps/web/src/components/RuntimeLiveTimeline.tsx` | UI-only elapsed clock | active unfinished run; cleared by effect teardown |
| `shared/useCommunityTypingPresence.ts` | UI-only typing-expiry clock | visible typing users; cleared by effect teardown |
| `shared/useDirectMessageTypingPresence.ts` | UI-only typing-expiry clock | visible typing users; cleared by effect teardown |
| `apps/web/src/controllers/useWebActiveCommunityShellController.ts` | backend presence heartbeat | visible active community; one in-flight call; cleared by effect teardown |
| `convex/runtimeCancellation.ts` | backend cancellation watcher | active runtime operation; one in-flight check; cleared in `finally` |
| `convex/runtimeExecutionSession.ts` | backend workspace heartbeat | active workspace session; one timer and in-flight touch; cleared by `dispose()` |

The executable contract scans the first-party source corpus. A new interval or
a second interval in an allowlisted file fails CI until it is deleted or
explicitly classified with cadence, isolation, overlap, and cleanup bounds.

#### Execution-scoped runtime work

| Operation | Lifetime | Current bounds | Status / required action |
| --- | --- | --- | --- |
| Runtime cancellation watcher | active runtime call only | minimum poll interval, one in-flight check, cleared at completion | `keep, prove` |
| Workspace execution heartbeat | active workspace session only | one in-flight touch, cleared at completion | `keep, prove` |

These loops are allowed only while the owned execution is active. A detached or
terminal execution must leave no timer, subscription, or scheduled successor.

#### Convex scheduled jobs

`convex/crons.ts` currently declares 8 jobs:

| Job | Cadence | Current batch bound | Classification |
| --- | --- | --- | --- |
| Process pending email outbox | 5 minutes | 10 | delivery repair; keep only with indexed due-work lookup |
| Recover distribution attribution deliveries | 5 minutes | 25 | delivery repair; keep only with indexed due-work lookup |
| Recover archived community billing cleanup | 5 minutes | 3 | billing repair; keep |
| Enqueue 24h event reminder emails | 15 minutes | 500 events, 500 recipients each | product job; verify due-window indexes and fanout accounting |
| Finalize expired Blaxel project workspace leases | 15 minutes | 100 | infrastructure repair; keep |
| Record Blaxel storage provider costs | 60 minutes | 100 rows x 5 pages | accounting; keep |
| Community memory sweep | 6 hours | 500 oldest due communities across bounded indexed sources | AI-triggering job; idle communities are absent, metabolism is outcome-revision gated, and compiler admission retains founder funding plus per-community caps |
| Process pending mention emails | 15 minutes | implementation-owned | notification job; declare an explicit batch bound in this registry |

The existence of a batch limit does not prove cost safety. Each job still needs
an indexed due-work query, bounded downstream fanout, idempotency where it
writes, and evidence that empty runs are cheap.

Weekly community digests are retired. Their scheduler, builder, templates, and
runtime preference gates have no MVP owner and must not be reintroduced without
a new product requirement and explicit recurring-work declaration.

## Confirmed Remediation Backlog

| ID | Priority | Work | Current state | Completion evidence |
| --- | --- | --- | --- | --- |
| COST-001 | P0 | Contain repeated profile hydration | `fixed in production` | production build marker plus no recurrence under remount/resume/render-churn proof |
| COST-002 | P0 | Delete attention polling and bound reactive attention reads | `implemented; staging proof pending` | idle tabs have no attention cadence; scopes are bounded; real activity reconciles reactively; update read cost is measured before adding storage |
| COST-003 | P0 | Remove N+1 bundle hydration from chat root listing | `confirmed` | feed query returns a thin bounded projection; full bundles load only on demand |
| COST-004 | P1 | Audit, delete, reduce, or consolidate scheduled repair drains | `partial; blind community sweep deleted` | four fixed global repair scans and the weekly digest job are deleted; community cognition is indexed due-work only; remaining retained jobs still need complete empty-run proof |
| COST-005 | P1 | Bound staging/realtime reconnect behavior | `implemented; staging proof pending` | disabled/dormant deployment and stale-client tests terminate without sustained calls |
| COST-006 | P1 | Validate auth/session call clusters | `investigate` | calls are attributable to distinct valid lifecycle events or a dedupe fix lands |
| COST-007 | P1 | Prove rate limiting for public cost-bearing HTTP surfaces | `open` | actor/IP/community limits and abuse tests for runtime, auth, ingestion, billing, and workers |
| COST-008 | P1 | Configure and prove provider alerts, budgets, and emergency controls | `open` | staging and production evidence from Convex/Vercel/provider consoles and a tested runbook |
| COST-009 | P1 | Add a recurring-work contract proof | `implemented for fixed-cadence surfaces` | CI rejects cron inventory drift and any undeclared `setInterval`; scheduler continuation census remains under COST-004 |
| COST-010 | P2 | Project cost health into operator diagnostics | `partial` | invocation/read/write/compute/provider cost rollups link to redacted evidence |
| COST-011 | P2 | Add the scheduled cost agent in alert-only mode | `deferred` | deterministic inputs, no mutation authority, concise incident report |
| COST-012 | P3 | Consider bounded automated containment | `deferred` | each action is named, reversible, pre-authorized, tested, and produces a durable receipt |

## Required Deterministic Controls

Controls must isolate the smallest abusive unit possible. Global limits are the
provider backstop, not the primary product policy.

1. Per-request input, output, duration, and downstream-call bounds.
2. Per-session/user/community concurrency and rate bounds on costly surfaces.
3. Idempotency and leases for retries, webhooks, workers, and scheduled writes.
4. Bounded exponential backoff with terminal retry budgets.
5. Visibility/activity gating for client polling and subscriptions.
6. Separate staging and production budgets and credentials.
7. Provider alerts before hard ceilings, with enough headroom for diagnosis.
8. Named kill switches for optional expensive subsystems—not a generic switch
   that takes all of Polynet offline.

Exact monetary thresholds belong in the private provider configuration and
operator runbook, not in this public repository. The repository records the
required policy and evidence without exposing sensitive account details.

## Scheduled Cost Agent Boundary

The scheduled cost agent is created only after COST-002 through COST-010 have
either been completed or explicitly risk-accepted.

Initial authority:

- read redacted cost and health evidence;
- compare observed values with deterministic thresholds;
- identify the deployment, function, endpoint, job, actor class, and time
  window responsible;
- produce an operator alert and recommended runbook step;
- never change provider settings, deploy code, delete data, cancel billing, or
  disable production.

A later version may invoke a specific containment action only when that action
is pre-authorized, deterministic, reversible, separately tested, and writes a
durable receipt. Ambiguity always escalates to the operator.

## Delivery Order

1. Maintain this inventory and delete unnecessary recurring work.
2. Fix attention read amplification.
3. Fix chat-feed N+1 hydration.
4. Simplify scheduled repairs and reconnect/lifecycle duplication.
5. Install endpoint isolation, rate limits, and named circuit breakers.
6. Prove provider budgets, alerts, and emergency runbooks.
7. Add cost telemetry, load/regression proofs, and operator projection.
8. Add the alert-only scheduled cost agent.
9. Consider tightly bounded automated containment only after operating evidence.

## Definition of Done

Platform cost safety v1 is complete when:

1. Every cost-bearing recurring operation is declared and proven bounded.
2. No known query rebuilds broad historical state on a fixed client poll.
3. List queries do not perform unbounded or avoidable per-row hydration.
4. Public cost-bearing surfaces isolate abuse per actor/IP/community.
5. Staging and production have separate, proven provider budgets and alerts.
6. A single account, tab, stale client, or job cannot cause a platform-wide
   spend-limit outage.
7. The operator can identify the primary cost driver without manually reading
   raw logs.
8. Incident containment is deterministic and reversible.
9. The scheduled agent is advisory until narrower mutation authority is
   explicitly approved.
