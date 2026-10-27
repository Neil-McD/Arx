# Integration provider decision — 2026-09-11

Status: Composio selected for the first read-only pilot by user direction; production acceptance remains open.
Code reference: clean workflow worktree at `2ee8180e2` before this document.
No accounts connected, credentials entered, provider operations executed, purchases,
vendor messages, or deployments. HubSpot is a comparison fixture, not a committed
first customer integration. This document changes no runtime or billing contract.

## Decision

Permission-path refinement: use Composio's native HUBSPOT_LIST_GRANTED_SCOPES
candidate rather than retrieving raw HubSpot tokens. The speculative direct-token
verifier has been removed. Versioned metadata and separately authorized sandbox
proof remain required before wiring it; live construction stays disabled.
See the implementation map for the exact acceptance gate and consent-scope caveat.

Use managed authentication and tool execution, preserving Polynet's authorization,
agent reasoning, workflow evidence, and accounting boundaries. Do not build a
catalog, adopt a second workflow engine, or enable arbitrary third-party MCP mounts.

Composio is the first pilot provider. This supersedes the earlier Pipedream-first
sandbox recommendation after user review of pricing and agent fit. Do not implement
Pipedream in parallel. Start with member-owned connection and one read, not the
full event fixture below. See [the implementation map](../composio-member-read-pilot-plan.md).
HubSpot trigger coverage and shared-app webhook behavior remain unresolved for
later workflow acceptance; neither blocks planning the bounded read-only pilot.
Native HubSpot webhooks are an option to evaluate later, not an authorized build.

## Exact fixture and coverage

Connect a test HubSpot account; read one synthetic contact by ID; approve an update
to one non-sensitive field; observe the change; record evidence without moving a
real member. Repeat with two member identities and a second community for denial
tests. No email, campaigns, deletes, or customer records.

| Requirement | Pipedream | Composio |
| --- | --- | --- |
| Read/update | `hubspot-get-contact`, `hubspot-update-contact` | Contact read and update tools documented |
| Property change | `hubspot-new-contact-property-change` exists; polling | Not in current two-trigger HubSpot catalog |
| Member setup | Managed OAuth documented; granted scopes need live review | Custom OAuth config supported; managed app warning documented |
| Events | Set `skipFirstRun=true`, `requirePropertyHistory=true`, `fetchAllProperties=false` | Catalog requires app ID/developer key; shared Polynet app needs confirmation |
| Isolation, delivery, revoke | Not live-tested | Not live-tested |

Sources: [Pipedream read](https://raw.githubusercontent.com/PipedreamHQ/pipedream/master/components/hubspot/actions/get-contact/get-contact.mjs),
[update](https://raw.githubusercontent.com/PipedreamHQ/pipedream/master/components/hubspot/actions/update-contact/update-contact.mjs),
[property source](https://raw.githubusercontent.com/PipedreamHQ/pipedream/master/components/hubspot/sources/new-contact-property-change/new-contact-property-change.mjs),
[polling implementation](https://raw.githubusercontent.com/PipedreamHQ/pipedream/master/components/hubspot/sources/common/common.mjs),
[Composio HubSpot](https://docs.composio.dev/toolkits/hubspot).

HubSpot supports app-level subscriptions across installations of the same OAuth
app. Current project-based app configuration supports property changes. Therefore
per-member developer setup is not an inherent HubSpot requirement; do not infer
that Composio's trigger adapter supports the shared-app arrangement without proof.
[App-level semantics](https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide),
[current app configuration](https://developers.hubspot.com/docs/apps/developer-platform/add-features/configure-webhooks).

## Verified commercial facts and scenarios

Pipedream pricing was verified in the rendered public page in both toggle states:
Connect costs $150 month-to-month, or $99/month equivalent with $1,188 billed
annually. Includes 10,000 monthly credits and 100 external users; additional users
are $2 each. [Pricing](https://pipedream.com/pricing).

Assume 100 or 1,000 vendor external users, one account each, 100 operations and 10
events each per month. Counts are vendor-wide, not an assumption that allowances
reset per Polynet community. Multi-community identity mapping may alter user counts.

| Scenario | Calls | Events | Pipedream monthly base + users, before overages | Composio Pro base-only illustration |
| --- | ---: | ---: | ---: | ---: |
| 100 users | 10,000 | 1,000 | $150 | $29 |
| 1,000 users | 100,000 | 10,000 | $1,950 | $29 |

Composio illustration assumes own OAuth app, session execution, ordinary tools,
and no shared-connection/proxy/other add-ons. These volumes fit published base
allowances; this is not a quote for a complete working HubSpot event path.
Managed OAuth and direct execution have different allowances/surcharges.
[Composio pricing](https://composio.dev/pricing).

Pipedream's annual-equivalent base + users would be $99 and $1,899 respectively,
before execution overages. Credit overage dollar rates remain unverified. Do not
equate polling runs to billed credits: Connect docs meter delivered source emits
and action/proxy computation. Provider API load and polling delay remain relevant.
[Connect billing](https://pipedream.com/docs/pricing).

At a hypothetical five-minute interval over 30 days, one source per user means
864,000 or 8,640,000 polling runs. This is not an observed interval, bill, or API
request count. Shared workspaces may permit fewer sources with explicit routing.

The documented usage API exposes time-window credit totals by operation class;
it does not establish per-community/per-run cost attribution. Verify that linkage
before billing customers. [Usage API](https://pipedream.com/docs/connect/api-reference/list-usage-records).

## Exact unanswered questions — drafted, not sent

Pipedream:
1. For the specified volumes, what is the credit overage rate, rounding, and total?
2. For this Connect registry source, what polling intervals are allowed, what is
   charged on idle polls, and what happens after failures or webhook delivery loss?
3. How are external users counted/prorated across projects and community-bound
   identities? How should community-owned connections be represented?
4. Which stable operation/source identifiers link actual billed usage to our own
   community/run receipt? What limits can stop spend before an operation?

Composio:
1. Can one Polynet-owned HubSpot OAuth app serve all member installations and
   trigger instances without member-owned apps or per-instance subscription clashes?
2. Is contact.propertyChange supported through that arrangement? If not, confirm
   using direct HubSpot webhooks alongside your custom OAuth auth config/tools.
3. Which execution path, version pinning, and usage fields support exact-account,
   server-authorized calls and per-community reconciliation, including shared accounts?

## Later full-fixture sandbox acceptance and permission boundary

Before external setup: user selects/authorizes provider project and a disposable
HubSpot test account, consents to exact OAuth scopes, and approves any terms.
Use contact read/write only where supported; reject unexpectedly broad consent.
Prefer development/free mode. Proposed paid usage cap: $5 incremental, not approved;
no paid plan, annual commitment, or automatic upgrade is authorized.

Run at most 20 explicit read/write attempts, one short-lived source, and two hours
of observation. Stop on unexplained writes, uncertain account selection, or budget
uncertainty. Record community, acting identity, connection, operation ID, result,
usage units, and whether cost is estimated or provider-reported. Exercise duplicate
event receipt, rejected cross-community calls, revoked connection, and retry after
ambiguous write response. Read back before retrying; do not claim exactly-once
effects from local receipt deduplication alone. Verify source stopped afterward.

Pass requires authenticated delivery, bounded latency acceptable to the user,
account isolation, no duplicate effects, disconnect denial, and reconcilable costs.
Failing any gate blocks production, not an invitation to add a second platform.

## Billing boundary discovered during orientation

The user's proposed direction is $79/community plus builder-paid metered usage
and markup. This is a new intended commercial model, not current implementation.
Current AGENTS.md includes a $20 raw Luna allowance and explicitly retires
card-backed tool collection. The billing reference describes a combined $20
inference/web-tool allowance. Reconcile this allowance wording and trace active
call paths during the later billing slice. Existing ledger/history presence does
not authorize reviving retired collection or establish active postpaid billing.

Keep integration community/run attribution now; defer prices, collection, and
customer invoice changes. Composio is selected for the read pilot only. Production
and later write/event capabilities require their own verified acceptance gates.
