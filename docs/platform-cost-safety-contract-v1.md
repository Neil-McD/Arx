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
   and email providers.
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
| Community attention subscription | one pooled realtime transport with one community and at most 10 stored channel/grant rows per reactive page | no fixed poll, no manual post-mutation refresh, and every execution is scope-bounded; total subscriptions scale with authorized pages | incomplete/failed assemblies are unknown, never fabricated all-read results; measure reads before adding a stored head projection |
| Active-community presence | mount, resume, and every 30 seconds while visible | one in-flight call; 90-second lease; scan limit 64 | `keep, verify`: behavior is bounded; prove one effective lease per actor/community across multiple tabs |
| Pending public join access | every 30 seconds while a signed-in visitor's approval request is pending on a visible join page; also on focus or visibility return | one in-flight actor/community access read per tab; no call for anonymous, approved, denied, hidden, or departed routes; timer stops when pending ends or route unmounts | `keep, verified on staging`: approval changed the open join page's CTA without a reload; retain this bounded read until an existing realtime access path can replace it |
| Founder checkout reconciliation | 1.5-second polling after checkout | canceled on teardown; route-specific | `keep, prove`: bounded commercial recovery must have an explicit attempt/time cap on every branch |
| Checkout finalization | delayed retries after provider redirect | centralized timeout ref and terminal attempt rules | `keep, prove`: idempotent finalization is required; no indefinite retry |
| Public Builder purchase attachment | 750-ms bounded post-auth checks | finite loop | `keep, prove`: commercial recovery only |
| Pending-purchase auto-redemption | delayed post-auth retries | six attempts with increasing delay | `keep`: bounded and tied to an unresolved purchase |
| Convex realtime authentication | reconnect re-authentication | one shared transport per deployment and actor; finite auth retry budget; terminal provider state retires the transport until explicit session recovery | `implemented; staging proof pending`: prove a disabled deployment produces one failed subscription burst followed by zero recurring calls |

One-second elapsed-time and typing-expiry display timers do not call a backend
and are excluded. Focus/animation/toast/image-cleanup timers are also excluded.
#### Fixed-interval source inventory

CI admits exactly these fourteen first-party `setInterval` call sites:

| Canonical call site | Classification | Required lifetime bound |
| --- | --- | --- |
| `apps/web/src/components/RuntimeLiveTimeline.tsx` | UI-only elapsed clock | active unfinished run; cleared by effect teardown |
| `apps/web/src/components/ChannelRosterPanel.tsx` | UI-only 30-second presence-lease expiry clock; no network calls | mounted channel roster; cleared by effect teardown |
| `shared/useCommunityTypingPresence.ts` | UI-only typing-expiry clock | visible typing users; cleared by effect teardown |
| `shared/useDirectMessageTypingPresence.ts` | UI-only typing-expiry clock | visible typing users; cleared by effect teardown |
| `apps/web/src/controllers/useWebActiveCommunityShellController.ts` | backend presence heartbeat | visible active community; one in-flight call; cleared by effect teardown |
| `apps/web/src/controllers/useWebPublicCommunityRouteController.ts` | backend pending-join access check | authenticated pending public join page only; visible tab, 30-second minimum interval, one in-flight call; cleared when pending ends or route unmounts |
| `convex/runtimeCancellation.ts` | backend cancellation watcher | active runtime operation; one in-flight check; cleared in `finally` |
| `apps/web/src/components/WebCommunityPods.tsx` | backend pod-member faces refresh (proposed) | open pod panel only; visible tab, 45-second interval; cleared on close |
| `apps/web/src/components/WebCommunitySettingProposals.tsx` | backend pending agent-proposal check (proposed) | owner settings open only; visible tab, 20-second interval; cleared on unmount |
| `apps/web/src/components/WebCommunityWelcome.tsx` | backend welcome-access check (proposed) | member held on the welcome page only; visible tab, 2 seconds while forms are prepared then 15 seconds; cleared when released |
| `apps/web/src/components/WebTestRunBar.tsx` | backend test-run status check (proposed) and a UI-only element finder | active owner test run only; visible tab, 30-second interval; the finder stops after 10 tries |
| `apps/web/src/components/WebCommunityWorkflowChanges.tsx` | backend workflow change-history and waiting-change refresh (proposed) | owner workflow changes view only; visible tab, 15-second interval; cleared on unmount |
| `apps/web/src/components/WebCommunityWorkflowsSection.tsx` | backend waiting agent-change check (proposed) | owner workflows section only; visible tab, 20-second interval; cleared on unmount |

The executable contract scans the first-party source corpus. A new interval or
a second interval in an allowlisted file fails CI until it is deleted or
explicitly classified with cadence, isolation, overlap, and cleanup bounds.

#### Execution-scoped runtime work

| Operation | Lifetime | Current bounds | Status / required action |
| --- | --- | --- | --- |
| Runtime cancellation watcher | active runtime call only | minimum poll interval, one in-flight check, cleared at completion | `keep, prove` |

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
| Community memory sweep | 6 hours | 500 oldest due communities across bounded indexed sources | AI-triggering job; idle communities are absent, metabolism is outcome-revision gated, and compiler admission retains founder funding plus per-community caps |
| Process pending mention emails | 15 minutes | implementation-owned | notification job; declare an explicit batch bound in this registry |
| Advance due workflow milestones | 1 minute | 25 due timers | member-workflow job; goes when member workflows are removed |
| Send due founder briefs | 15 minutes | 25 due briefs (`MAX_BRIEFS_PER_RUN`) | AI-triggering job: one founder-funded model call per brief, deterministic brief when funding or the model is unavailable |

The existence of a batch limit does not prove cost safety. Each job still needs
an indexed due-work query, bounded downstream fanout, idempotency where it
writes, and evidence that empty runs are cheap.

Weekly community digests are a protected MVP engagement requirement, but their
previous broad-scan scheduler remains retired. Restoration is gated on one
indexed schedule row per community, lifecycle fencing, finite leases and
retries, paginated recipient continuation, outbox deduplication, and these hard
per-run ceilings:

- at most 5 communities claimed;
- at most 50 recipients from one community batch;
- at most 100 recipients across the entire run;
- at most 8 rendered content items.

The schedule foundation, historical member-email renderer, and bounded worker
are present. Lifecycle enrollment is wired atomically to the canonical
community create, archive, and restore authorities. The bounded worker remains
dormant because no digest cron is active. It consumes only indexed due-work,
checkpoints recipient overflow, reuses one bounded content snapshot, and
enqueues through the canonical idempotent outbox. Existing active communities
must be enrolled once through the same idempotent lifecycle sync after release;
that enrollment does not send email or activate recurring work.

## Confirmed Remediation Backlog

| ID | Priority | Work | Current state | Completion evidence |
| --- | --- | --- | --- | --- |
| COST-001 | P0 | Contain repeated profile hydration | `fixed in production` | production build marker plus no recurrence under remount/resume/render-churn proof |
| COST-002 | P0 | Delete attention polling and bound reactive attention reads | `implemented; staging proof pending` | idle tabs have no attention cadence; scopes are bounded; real activity reconciles reactively; update read cost is measured before adding storage |
| COST-003 | P0 | Remove N+1 bundle hydration from chat root listing | `confirmed` | feed query returns a thin bounded projection; full bundles load only on demand |
| COST-004 | P1 | Audit, delete, reduce, or consolidate scheduled repair drains | `partial; blind community sweep deleted` | four fixed global repair scans and the unsafe weekly digest job are deleted; its protected replacement is indexed but remains disabled; remaining retained jobs still need complete empty-run proof |
| COST-005 | P1 | Bound staging/realtime reconnect behavior | `implemented; staging proof pending` | disabled/dormant deployment and stale-client tests terminate without sustained calls |
| COST-006 | P1 | Validate auth/session call clusters | `investigate` | calls are attributable to distinct valid lifecycle events or a dedupe fix lands |
| COST-007 | P1 | Prove rate limiting for public cost-bearing HTTP surfaces | `open` | actor/IP/community limits and abuse tests for runtime, auth, ingestion, billing, and workers |
| COST-008 | P1 | Configure and prove provider alerts, budgets, and emergency controls | `open` | staging and production evidence from Convex/Vercel/provider consoles and a tested runbook |
| COST-009 | P1 | Add a recurring-work contract proof | `implemented for fixed-cadence surfaces` | CI rejects cron inventory drift and any undeclared `setInterval`; scheduler continuation census remains under COST-004 |
| COST-010 | P2 | Project cost health into operator diagnostics | `partial` | invocation/read/write/compute/provider cost rollups link to redacted evidence |
| COST-011 | P2 | Add the scheduled cost agent in alert-only mode | `deferred` | deterministic inputs, no mutation authority, concise incident report |
| COST-012 | P3 | Consider bounded automated containment | `deferred` | each action is named, reversible, pre-authorized, tested, and produces a durable receipt |
| COST-013 | P1 | Restore the protected weekly community digest | `lifecycle enrollment implemented; worker activation disabled` | indexed due-work, lifecycle fence, finite lease/retry, bounded recipient continuation, preference gate, outbox dedupe, explicit existing-community enrollment, then explicit cron activation |

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
