# Domain Dossier — Workspace/Harness, Runtime, and Asynchronous Operations

## Irreducible boundary

The coding harness, community harness, worker/runtime, app-server and computer
tools, project/thread persistence, lifecycle evidence, and provider isolation
are protected. The standalone general-purpose Workspace destination and its
human preview presentation are deferred. The correct simplification is
therefore **delete the duplicate destination/presentation while preserving the
bounded capability substrate**.

## Workspace and thread substrate

Schema and runtime modules own projects, threads/messages/attachments, runs/events, terminals, previews, runtime sessions, credits, provider leases, and failure receipts. Web runtime cannot directly execute local filesystem/shell tools. Worker/provider operations enforce root/path and symlink boundaries, use explicit session identity, and emit runtime evidence. These are strong invariants worth retaining.

The browser route state is now deliberately asymmetric. It cannot represent or
generate Workspace: the page type, route builders, route controller, and
Workspace-only shell branches are deleted. The parser still recognizes inbound
`/workspace*` migration inputs and holds Landing until auth-aware destination
resolution sends the user to a community, Discover, public funnel, root, or
legacy launch setup under community Settings.

The unmounted 2,625-line `WebWorkspaceHost.tsx` product host was deleted in
C7.1A. Builder Partner remains retained through its secondary Settings and
operator owners; mixed contracts no longer use the dead host as authority.
C7.1B deleted the remaining outbound browser route controller/builders and
route-backed App orchestration. Thread/project selection remains as non-navigation
runtime state. C7.1C deleted the unreachable right-panel/files presentation, its
browser inspector adapter, dormant App panel/manual-computer state, and exclusive
styles. C7.1D deleted the zero-caller legacy preview, thread-browser, and
Workspace conversation presentation closure plus exclusive styles and
projection helpers. C7.1E deleted the zero-caller project modals/controller,
their global-overlay and App state, browser project mutation/import commands,
the browser Workspace card-setup/status bridge, two zero-caller shared helpers,
and exclusive styles. Operator, Billing Settings, member-agent, and turn-runner
proofs now follow mounted owners. C7.1F deleted the zero-caller browser project
listing/draft-selection closure, model/surface wrappers, and reset-only
lifecycle module. Browser project identity now comes directly from the active
canonical thread. C7.1G deleted the presentationless App conversation/runtime
closure, guest cache, model registry, message/inference overlays, duplicate
landing lifecycle, and their zero-caller helpers. The mounted member-agent dock
now owns its channel, messages, turn state, live runtime timeline, structured
errors, and session-scoped clearing; canonical account/community clearing
remains in the session reset. Settings owns authenticated agent-data export.
C7.1H deleted the stylesheet rules emitted only by the retired host and its
zero-producer overlays, simplified live negative selectors, and preserved
shared community, bootstrap, skeleton, and main-surface presentation. Older
ownerless stylesheet clusters remain a separate audit rather than being
deleted by lexical name. C7.2A completed the first caller-led cohort: the
superseded pre-ConversionLanding selector family and its exclusive keyframes
are deleted, the two live setup kickers have a neutral shared owner, and the
mounted ConversionLanding plus mobile onboarding arms are contract-locked.
The unmounted background-terminal rail, computer-use viewer, and Daytona
app-preview card are deleted in C7.3A-C with their exclusive browser adapters,
transport, configuration, and styles. Backend app-server/terminal/computer
execution, lifecycle events and target accounting, paid admission, agent
tools, and the generic access-gated proxy security core remain. Any remaining
ownerless style still requires a fresh caller-led slice; lexical names never
authorize removal of protected harness/runtime substrate.

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
| remaining Workspace browser/style state | any newly ownership-proved CSS cohort | deletion requires exclusive ownership proof; lexical absence alone is insufficient and names can also describe protected execution substrate |
| runtime events/receipts | runs × events | storage retention and operator query cost unclear |
| provider workers/previews | sessions × time/cost | needs cleanup, lease finalization, and accounting convergence |

## Reduction candidates

| Candidate | Classification | Action | Idiot index | Rationale |
| --- | --- | --- | ---: | --- |
| protected coding/community harness substrate | `KEEP (MVP core)` | `HARDEN` | 1 | explicitly protected and required for external execution |
| standalone Workspace as primary navigation destination | `DELETE (deferred/dead)` | `COMPLETE` | 9 | C7.1A-B deleted the host and all outbound browser navigation; inbound migration classification remains |
| Workspace right-panel/files browser authority | `DELETE (deferred/dead)` | `COMPLETE` | 9 | C7.1C deleted the unreachable presentation, browser adapter, dormant App controls, and exclusive styles while retaining backend inspector/runtime owners |
| Workspace preview/thread-browser/message leaf presentation | `DELETE (deferred/dead)` | `COMPLETE` | 9 | C7.1D deleted the zero-caller UI closure, exclusive styles, and presentation-only projection helpers while re-anchoring proofs on mounted owners |
| Workspace project-modal/browser mutation and card-setup presentation | `DELETE (deferred/dead)` | `COMPLETE` | 9 | C7.1E deleted zero-caller modal/controller/overlay state and browser commands while retaining project/runtime and Stripe/resource authority |
| Workspace browser project-list/draft-selection projection | `DELETE (deferred/dead)` | `COMPLETE` | 10 | C7.1F deleted the unfetched project array, duplicate selector/model/surface wrappers, browser gateway, and obsolete proof while retaining direct thread project identity |
| presentationless App conversation/runtime authority | `DELETE (deferred/dead)` | `COMPLETE` | 10 | C7.1G deleted the second browser conversation owner and zero-caller helpers while the mounted member-agent dock and shared runner retain the live path |
| deleted-host stylesheet residue | `DELETE (deferred/dead)` | `COMPLETE` | 10 | C7.1H removed only selector families owned by the retired host/overlays and preserved live shared arms and negative-selector semantics; C7.3 later removed the separately proved dormant-viewer styles |
| pre-ConversionLanding stylesheet residue | `DELETE (deferred/dead)` | `COMPLETE` | 10 | C7.2A deleted 343 pure legacy rules and 20 exclusive keyframes, retained two setup emitters under a neutral owner, and preserved the live mobile onboarding arms |
| auxiliary loading/starter/download/session-resume stylesheet residue | `DELETE (deferred/dead)` | `COMPLETE` | 10 | C7.2B deleted 80 pure zero-emitter rules across both stylesheets, removed one empty media wrapper, and positively preserved the mounted generic skeleton primitives and animation |
| dormant background-terminal browser presentation | `DELETE (deferred/dead)` | `COMPLETE` | 9 | C7.3A deleted the unmounted rail, zero-caller browser gateway, and exclusive styles while retaining backend terminal process/evidence, preview, billing, provider, and agent-tool authority |
| dormant computer-use and Daytona app-preview viewers | `DELETE (deferred/dead)` | `COMPLETE` | 9 | C7.3B-C deleted both unmounted browser presentations and their exclusive adapters/transport while retaining app-server/computer execution, lifecycle evidence, target accounting, and protected harness substrate |
| Workspace host coupling to Builder Partner UI | `DELETE (deferred/dead)` | `COMPLETE` | 9 | C7.1A deleted the unmounted host; retained partner UI remains in Settings/operator owners |
| workspace route builders/controllers after parser retirement | `DELETE (deferred/dead)` | `COMPLETE` | 8 | outbound owners are deleted; inbound classification remains separate from backend substrate |
| remaining no-cursor repeating prefix sweeps | `KEEP (MVP core)` | `HARDEN`, `BOUND` | 9 | claims reliable automation while permanently starving eligible work |
| durable runtime receipts | `KEEP (MVP core)` | `RETENTION`, `BOUND` | 2 | necessary for audit/recovery, but not forever at full fidelity |

## Closure rule

Do not delete workspace tables/functions just because the destination is deferred. First classify every path as protected execution substrate, migration compatibility, or standalone UI. Remove only the third class and adapters proven unused; then decompose the retained host/runtime around capability boundaries.
