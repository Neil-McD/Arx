# R41NB0W Operator Retirement v1

## Completed decision

R41NB0W was a single, explicitly authorized operator retirement. It does not
re-enable public community deletion and it is not a reusable account-deletion
surface.

The production operation completed on 2026-08-01 from validated commit
`858949787942591e757182ebe8a566c108259f64`. It deleted only:

- the canonical R41NB0W community and community-owned product state;
- its community-owned stored media;
- the owner's `approved`, never-activated existing-founder grant; and
- the owner's stored OpenAI API-key connection selected by the exact row ID.

It preserved the owner user identity, authentication history,
entitlements, memberships in other communities, direct-message history,
developer apps, Stripe Connect account, price points, checkout sessions,
purchase claims, provider-cost/credit records, runtime history, business visit
history, and critical audit records. Pending checkout artifacts remain as
historical evidence; no completed checkout, redeemed claim, subscription,
community membership, join request, inference policy, inference receipt, or
canonical operation receipt existed at execution time.

There were no member-agent channels to detach. The existing bounded cleanup
worker drained all derived community cognition.

## Safety contract

The temporary operator function was internal-only and required four exact
production IDs plus an exact confirmation phrase. Its production dry run
returned `ready` with zero violations. The committed operation deleted 148
community product rows, three canonical/control rows, six community-owned media
objects, and 77 derived cognition rows. The temporary function and its helper,
tests, and proof script were removed after the post-deletion inspection reached
`retired` with zero remaining product or cognition rows.

The production database backup taken before the founder-inference migration is
the recovery source if historical restoration is ever required. Its operator
path and checksum are recorded in `docs/alpha-release-workflow.md`.

## Preserved production evidence

The post-deletion inspection proved the following retained counts:

- one owner user;
- 76 indexed authentication-session records;
- one membership in an unrelated community;
- one Stripe Connect account;
- four historical price points;
- four pending checkout sessions;
- four pending purchase claims;
- five developer apps;
- one direct-message participation; and
- one successful durable retirement audit event, in addition to the prior audit
  history.

The canonical community row, founder grant, selected OpenAI connection, and all
target community memberships are absent. Historical price, checkout, claim,
Stripe, runtime, business-visit, user, DM, app, and audit evidence remains
intentionally non-canonical for access and cannot make the deleted community
resolvable.
