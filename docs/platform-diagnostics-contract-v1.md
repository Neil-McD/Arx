# Platform Diagnostics Contract v1

## Purpose

Platform diagnostics exist to tell the operator whether Polynet is secure, healthy, fast, and trustworthy.

This is not a generic analytics dashboard. It is the operating contract for turning platform evidence into operator decisions.

The irreducible question is:

> Is Polynet operating correctly enough that users, builders, communities, and the operator can trust it?

## Scope

This contract covers platform diagnostics only.

In scope:

- security and audit evidence
- auth, session, and access health
- latency and runtime health
- AI/tool/MCP execution health
- billing, webhook, credit, entitlement, and payout correctness
- deploy and release evidence
- diagnostics freshness and observability coverage
- the operator panel as the decision surface

Out of scope for this first contract:

- full funnel builder analytics
- broad BI dashboards
- deep cohort analysis
- builder coaching playbooks
- long-term data warehouse design
- replacing external observability tools

## Principles

1. Keep one canonical source for product truth.
2. Use external tools for the evidence they are best at collecting.
3. The operator panel summarizes evidence into decisions; it should not become the raw log warehouse.
4. Diagnostics must identify what is broken, risky, slow, insecure, stale, or silently drifting.
5. Every operator-facing claim should point back to evidence.
6. Privacy wins over observability. Do not send sensitive content to external tools by default.

## Tool Ownership

| Tool | Primary Role | Best Signals | Not For |
| --- | --- | --- | --- |
| Convex | Canonical product state, durable audit, operator snapshots | users, communities, memberships, entitlements, billing state, critical audit events, runtime event records | long-term raw log warehouse |
| Convex logs / log streams | Backend execution evidence | function failures, backend logs, backend latency, scheduled job failures | final operator UX |
| Sentry | Execution observability | frontend errors, traces, performance, release correlation, AI/model/tool spans | canonical product state |
| PostHog | Product behavior analytics | activation, funnels, community/member actions, builder behavior | security or billing truth |
| Vercel | Web host and release evidence | deployment status, build failures, route/runtime host logs, asset availability | product analytics source |
| Workspace runtime | Sandbox and workspace execution evidence | sandbox lifecycle, process logs, terminal output, workspace tool failures | product/business analytics |
| Stripe | Payment and payout truth | checkout, subscription, invoice/payment state, Connect status, disputes/refunds | product engagement analytics |
| GitHub Actions / proof scripts | Regression prevention and release confidence | failing checks, contract proofs, build/typecheck/audit guards | runtime observability |
| Fly | Preview proxy evidence, if active | preview proxy logs, live desktop proxy health | main app diagnostics source |

## Status Labels

Each diagnostic signal should be classified with one of these statuses:

| Status | Meaning |
| --- | --- |
| `existing` | The signal is already captured and queryable enough for operator use. |
| `partial` | Some evidence exists, but the signal is fragmented, missing rollups, or not yet operator-ready. |
| `missing` | The product does not currently capture the signal in a reliable way. |
| `external_only` | The signal lives in an external tool and should be summarized, not duplicated. |
| `deferred` | Useful later, but not needed for the first diagnostics layer. |

## Platform Surface Map

| Chunk | Platform Surface | Core Question | Primary Tools | Key KPIs / Signals | Current Status |
| --- | --- | --- | --- | --- | --- |
| Web and deploy health | Vercel app, SPA shell, route loading, assets | Is production reachable and running the expected release? | Vercel, Sentry, Convex probe | deploy status, build ID, route load errors, frontend crash rate, failed asset loads, p95 page load | partial |
| Auth and access | sign-in, auth bootstrap, session refresh, entitlements, community gates, operator gate | Can users get in and only access what they should? | Convex, Sentry, critical audit, PostHog | sign-in/session established, auth bootstrap failures, session refresh failures, entitlement mismatches, denied access, operator access granted/denied | partial |
| Security and audit | privileged mutations, destructive actions, webhooks, operator access | Are trust boundaries holding? | Convex critical audit, Sentry, Stripe | permission denied events, webhook signature failures, account deletion events, operator role changes, suspicious retries | partial |
| Runtime and AI | workspace turns, model calls, streaming, provider calls | Can the intelligence layer complete work reliably? | Sentry, Convex runtime events, Vercel/Convex logs | turn success rate, time to first token, p95 turn latency, provider failures, rate limits, cost per successful turn | partial |
| Tools, MCP, and workspace runtime | MCP validation, tool calls, terminal/computer use, sandbox lifecycle | Can tools actually execute? | Blaxel, Convex runtime events, Sentry spans, MCP diagnostics | tool success rate, tool failures by app/tool, sandbox create failures, timeout rate, MCP live/not-live reasons | partial |
| Integrations and harness | Settings-managed apps/skills, canonical harness projection | Are apps and skills configured and projected correctly? | Convex, PostHog, Sentry | setup success rate, duplicate/canonicalization conflicts, setup-needed count, validation failures, click-to-live rate | partial |
| Community core | chat, feed, resources, events, members, settings | Are communities usable once joined? | Convex, PostHog, Sentry | message send failures, resource load failures, event creation failures, member action failures, community route errors | partial |
| Funnel and join | public funnel, join request, paid join, checkout activation | Can visitors become members? | PostHog, Convex, Stripe, Sentry | page visits, join starts, join completions, conversion rate, checkout failures, pending checkout age | partial |
| Billing and entitlements | account commerce, credits, community subscriptions, payouts | Is money state correct? | Stripe, Convex audit, Sentry | checkout completion, webhook failures, subscription sync failures, credit reservation/settlement failures, payout blocked count | partial |
| Operator panel health | operator panel load, snapshots, attention queue | Can the operator trust the panel? | Convex, Sentry, proof scripts | snapshot freshness, query failures, missing evidence, unknown error codes, stale diagnostics | partial |

## KPI Contract

### Web and Deploy Health

| KPI | Definition | Source of Truth | Tool | Panel Priority |
| --- | --- | --- | --- | --- |
| Current production build | Git/Vercel build currently serving production | Vercel deployment metadata and app `version.json` | Vercel | now |
| Frontend crash rate | Sentry frontend errors over selected window | Sentry | Sentry | now |
| Route load failures | Failed route/app shell loads by route | Sentry and Vercel logs | Sentry, Vercel | now |
| Asset load failures | JS/CSS/image loading failures | Browser/Sentry evidence | Sentry | later |
| p95 page load | Tail page load latency by major surface | Sentry traces | Sentry | later |

### Auth and Access

| KPI | Definition | Source of Truth | Tool | Panel Priority |
| --- | --- | --- | --- | --- |
| Auth session established | Successful auth bootstrap into a canonical app session | Convex auth state plus client event | Convex, PostHog | now |
| Auth bootstrap failures | Failure to establish identity/session after app load | Convex logs and Sentry | Convex, Sentry | now |
| Session refresh failures | Failed refresh or expired session recovery failures | Convex auth/session flow | Convex, Sentry | now |
| Entitlement mismatches | User has paid/access state that does not match entitlement projection | Convex canonical state | Convex | now |
| Community access denied | Failed community access checks by reason | Convex access/gate records | Convex | now |
| Operator access granted/denied | Operator panel access attempts and outcomes | `criticalAuditEvents` and operator access query | Convex | now |
| Unknown auth errors | Auth failures without normalized error code | Sentry/Convex logs | Sentry, Convex | now |

### Security and Audit

| KPI | Definition | Source of Truth | Tool | Panel Priority |
| --- | --- | --- | --- | --- |
| Critical audit events | Security/billing/operator events recorded durably | `criticalAuditEvents` | Convex | now |
| Webhook verification failures | Invalid or failed webhook verification attempts | Stripe webhook handler/audit | Convex, Stripe | now |
| Privileged mutation failures | Manager/operator/admin mutations that fail or are denied | Convex logs/audit | Convex, Sentry | now |
| Destructive actions | Account delete, role changes, removals, revocations | `criticalAuditEvents` | Convex | now |
| Suspicious access attempts | Repeated denied access or malformed privileged requests | Diagnostics rollup | Convex, Sentry | later |

### Runtime and AI

| KPI | Definition | Source of Truth | Tool | Panel Priority |
| --- | --- | --- | --- | --- |
| Turn success rate | Completed AI turns divided by started turns | Convex runtime records | Convex | now |
| Turn failure rate | Failed AI turns by normalized reason | Convex runtime records and Sentry errors | Convex, Sentry | now |
| Time to first token | Time from request start to first streamed token | Runtime traces/events | Sentry, Convex | later |
| p95 turn latency | Tail latency for completed AI turns | Sentry spans or Convex runtime events | Sentry, Convex | now |
| Provider failures | Model/provider failures by provider/error code | Runtime logs/events | Sentry, Convex | now |
| Rate-limit failures | Provider or platform rate-limit events | Runtime logs/events | Sentry, Convex | now |
| Cost per successful turn | Credits/cost divided by successful turns | Convex credits/compute records | Convex | later |

### Tools, MCP, and workspace runtime

| KPI | Definition | Source of Truth | Tool | Panel Priority |
| --- | --- | --- | --- | --- |
| Tool success rate | Successful tool calls divided by tool calls | `runtimeRunEvents` | Convex | now |
| Tool failures by tool | Failed calls grouped by tool/app/MCP | `runtimeRunEvents` and Sentry spans | Convex, Sentry | now |
| MCP validation failures | App/MCP validation failures by app/reason | MCP validation records | Convex, Sentry | now |
| MCP not-live reasons | Mounted apps not live by normalized reason | canonical harness projection | Convex | now |
| Sandbox create failures | Blaxel sandbox create/start failures | Blaxel client logs and structured errors | Blaxel, Convex, Sentry | now |
| Workspace command failures | Failed terminal/process commands and exit code | workspace command logs and runtime events | Blaxel, Convex | now |
| Stuck sandbox/process age | Oldest active sandbox/process past expected lifetime | workspace reconciliation state | Blaxel, Convex | later |

### Integrations and Harness

| KPI | Definition | Source of Truth | Tool | Panel Priority |
| --- | --- | --- | --- | --- |
| App setup success rate | Successful settings-based app setup to canonical harness state | Convex app mount state and PostHog events | Convex, PostHog | now |
| Community app projection success | Community app state resolves to the effective user harness | Convex effective MCP projection | Convex | now |
| Duplicate app conflicts | Same app appears more than once in effective user harness | Convex diagnostic query | Convex | now |
| Setup-needed count | Apps mounted but not live | Convex harness projection | Convex | now |
| Click-to-live rate | Added apps that become live in selected window | Convex and PostHog | Convex, PostHog | later |

### Community Core

| KPI | Definition | Source of Truth | Tool | Panel Priority |
| --- | --- | --- | --- | --- |
| Chat send failures | Failed community chat/post submissions | Convex logs and Sentry | Convex, Sentry | now |
| Resource load failures | Resource panel/query failures | Convex logs and Sentry | Convex, Sentry | later |
| Event mutation failures | Failed create/edit/cancel community event actions | Convex logs and Sentry | Convex, Sentry | later |
| Member action failures | Failed approve/remove/role/ban actions | Convex logs and critical audit where applicable | Convex, Sentry | now |
| Community route errors | Community page/tab load failures | Sentry route context | Sentry | now |

### Funnel and Join

| KPI | Definition | Source of Truth | Tool | Panel Priority |
| --- | --- | --- | --- | --- |
| Funnel visits | Public funnel visits in selected window | Convex public visit events and PostHog | Convex, PostHog | now |
| Join starts | Join requests or checkout starts | Convex and PostHog | Convex, PostHog | now |
| Join completions | Approved/joined/paid unlocked memberships | Convex membership/access state | Convex | now |
| Conversion rate | Join completions divided by funnel visits | Convex analytics rollup | Convex | now |
| Pending checkout age | Oldest provider-backed community checkout awaiting verified completion | Convex checkout sessions | Convex | now |
| Checkout failure rate | Failed/expired checkouts by surface | Stripe/Convex checkout sessions | Stripe, Convex | now |

### Billing and Entitlements

| KPI | Definition | Source of Truth | Tool | Panel Priority |
| --- | --- | --- | --- | --- |
| Checkout completion rate | Completed checkout sessions divided by starts | Stripe and Convex checkout sessions | Stripe, Convex | now |
| Webhook failures | Failed Stripe webhook events | `criticalAuditEvents` and logs | Convex, Stripe | now |
| Subscription sync failures | Provider subscription state not synced into canonical state | Convex audit/state checks | Convex, Stripe | now |
| Credit reservation failures | Failed credit reservation attempts | Convex credit records/logs | Convex | now |
| Credit settlement failures | Failed credit settlement/refund attempts | Convex credit records/logs | Convex | now |
| Payout blocked count | Builders with paid communities and Connect not ready | Convex and Stripe Connect | Convex, Stripe | now |
| Refund/dispute events | Refunds, disputes, chargebacks | Stripe | Stripe | later |

### Operator Panel Health

| KPI | Definition | Source of Truth | Tool | Panel Priority |
| --- | --- | --- | --- | --- |
| Snapshot freshness | Time since latest diagnostics/operator snapshot computation | Convex diagnostics state | Convex | now |
| Operator query failures | Operator panel load/query failures | Sentry and Convex logs | Sentry, Convex | now |
| Missing evidence count | Operator rows without required evidence pointers | Convex diagnostics checks | Convex | later |
| Unknown error-code count | Diagnostics events without normalized error code | Convex diagnostics | Convex | now |
| Coverage by surface | Percent of critical surfaces with diagnostic events | Contract/proof scripts | GitHub Actions, Convex | later |

## Event Taxonomy

Event names should use dotted namespaces when introducing new diagnostics events:

- `auth.*`
- `access.*`
- `security.*`
- `billing.*`
- `runtime.*`
- `mcp.*`
- `tool.*`
- `community.*`
- `funnel.*`
- `deploy.*`
- `diagnostics.*`

Examples:

- `auth.session_established`
- `auth.bootstrap_failed`
- `access.community_denied`
- `security.operator_access_denied`
- `billing.webhook_failed`
- `runtime.turn_failed`
- `mcp.validation_failed`
- `tool.call_failed`
- `diagnostics.snapshot_computed`

## Privacy Rules

Diagnostics must not leak sensitive user or builder content.

Default rules:

1. Do not send raw prompts, messages, tool outputs, API keys, bearer tokens, auth cookies, or payment details to Sentry/PostHog.
2. External tools may receive stable IDs, route names, subsystem names, status, duration, release, normalized error codes, and redacted context.
3. Full tool output belongs in first-party/runtime-controlled storage only when required for product function or explicit debugging.
4. Rich payload capture is allowed only in local/dev or an explicit operator-debug mode.
5. Operator-facing summaries should show evidence IDs and normalized reasons, not raw secrets or private content.

## Diagnostic Data Shape

If/when we add first-party diagnostics records, use a small canonical shape:

```ts
type PlatformDiagnosticEvent = {
  eventKey: string;
  eventType: string;
  subsystem:
    | "auth"
    | "access"
    | "security"
    | "billing"
    | "runtime"
    | "mcp"
    | "tool"
    | "community"
    | "funnel"
    | "deploy"
    | "diagnostics";
  severity: "info" | "warning" | "error";
  status: "started" | "succeeded" | "failed" | "blocked" | "ignored";
  surface?: string;
  userId?: string;
  communityId?: string;
  projectId?: string;
  threadId?: string;
  runId?: string;
  requestId?: string;
  release?: string;
  latencyMs?: number;
  errorCode?: string;
  metadata?: unknown;
  createdAt: number;
};
```

This shape should stay small. Domain-specific source tables should remain the canonical data owner.

## Operator Panel Projection

The operator panel should project diagnostics in this order:

1. Health summary: `healthy | degraded | incident | unknown`
2. Attention queue: the highest-leverage issues to inspect now
3. Subsystem cards: auth, security, runtime, MCP/tools, billing, deploy
4. Evidence feed: recent critical events with severity, subsystem, actor/context, timestamp, evidence ID
5. Drill-out links: Sentry issue/trace, Vercel deploy/logs, Stripe object, Convex row/function/log, workspace process/logs

The panel should not show every metric by default. Metrics should earn a place by answering an operator question.

## First Implementation Chunk

Start with Auth and Access Diagnostics.

Reason:

- identity and access are the trust root
- the operator panel itself depends on correct operator gating
- community access, billing entitlements, MCP harness state, and runtime permissions all depend on it

First implementation should prove:

1. auth session established
2. auth bootstrap failed
3. session refresh failed
4. community access denied
5. entitlement mismatch detected
6. operator access granted
7. operator access denied
8. unknown auth/access error

Minimum output:

- durable Convex evidence where product truth matters
- Sentry error/trace context where runtime failure matters
- PostHog event only where product behavior matters
- compact operator panel projection with current health and recent attention items

## Acceptance Criteria

This contract is ready to implement from when we can answer:

1. Which tool owns each signal?
2. Which source is canonical?
3. Which metrics belong in the operator panel now?
4. Which details should stay in Sentry/PostHog/Vercel/Stripe/Blaxel?
5. Which events are missing?
6. Which first slice can be implemented without widening scope?

The first slice is complete when:

1. Auth and Access diagnostics have a durable event contract.
2. Existing auth/access evidence is mapped to that contract.
3. Missing events are added narrowly.
4. The operator panel can show Auth and Access health without reading raw logs manually.
5. Proof scripts prevent losing the basic auth/access diagnostics surface.

## Defer

Do not add these until the first diagnostics slice is working:

- Supabase or separate SQL warehouse
- broad BI dashboards
- per-builder coaching workflow
- advanced anomaly detection
- raw prompt/tool-output export to third-party observability
- automated operator actions
