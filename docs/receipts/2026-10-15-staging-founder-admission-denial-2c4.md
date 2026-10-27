# Slice 2C4: denial, cooldown and reapplication

**Scoped staging acceptance passed October 15, 2026. Production was untouched.**

[Structured evidence](evidence/2026-10-15-staging-founder-admission-denial-2c4.json).
[Approved scope](../archive/polynet-staging-founder-admission-denial-2c4.md).
[Draft PR #174](https://github.com/Neil-McD/Arx/pull/174), stacked on #173.

## Release identity and verification

| Boundary | Evidence |
| --- | --- |
| Runtime candidate / Git staging / served staging | `32bf8995effd2b4fed485b4e9bc4b0393aaa1653` |
| Initial code candidate | `16d288bcf4d6900c587401b2e550183fd6e80c1a`; runtime candidate adds documentation only |
| Backend | Explicit `convex dev --once --typecheck enable --env-file /tmp/polynet-package-1-staging.env`, exit 0; `dev:quick-porcupine-949` |
| Backend source tree | `b869139fe77657e467c942142c12a4840b62df97`, identical in both clean candidates; deployment provenance, not remote commit attestation |
| Clean candidate gates | Both initial and final candidates passed all 15 steps; expected/head/build identities match; 1,777 tests / 192 files; both dependency audits zero |
| Focused review | 173 tests / four files; backend/web typechecks, semantic, canonical-operation and verified-identity proofs passed |
| Web deployment | [Git staging deployment](https://vercel.com/neil-mcds-projects/polynet-staging/4LghZjvBkYKBfabQdj2GgQDYKeAS) |
| Serving asset | `/assets/index-o54qA2e5.js`; SHA-256 `ea0de874387cf38c5abce6b59c22c3ea4af52b301a10136d4847166a551fc3af`; both staging Convex hosts embedded |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4`, unchanged |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |

The first candidate's feature preview was canceled and no staging web build
appeared. A documentation-only candidate was validated and pushed to Git staging
before the feature branch; its staging deployment and serving marker matched.
No Vercel release command or provider setting change was used. Read-only Vercel
inspection distinguished a canceled preview from the existing staging alias.

Remote [runtime-candidate CI passed](https://github.com/Neil-McD/Arx/actions/runs/38781348264).
The exact local candidate gate passed independently; receipt-head CI is separate
from the deployed runtime.

## Implemented contract

- `community.admission.deny`, version 1, uses existing discovery/read/call tools.
  There are still five public tools and no new schema table or scheduler.
- Current human owner/admin authority is required before a new decision and
  historical replay. Members, moderators, applicants and community agents cannot
  invoke the new capability. Existing first-party moderator rights remain.
- The exact capability target, pending request reference, observed canonical
  creation/update timestamps and idempotency key are required. The current
  request pair must be canonical and unambiguous, under approval entry, for an
  unblocked non-owner without an existing membership or subscription.
- Approval and denial share their bounded parser and receipt handling. Domain
  effects remain explicit. Denial calls the existing core, sets the unchanged
  seven-day server-clock policy, records an audit keyed by application attempt,
  and completes its historical receipt in one transaction.
- Completed retries never extend cooldown or act on a later application using
  the same row ID. New keys with stale observations fail closed. Cross-operation
  key reuse conflicts. No denial email, workflow, activation or access grant is
  introduced.
- Applicant status and explicit reapplication retain the existing public access
  projection and join owner. Expiry alone does not reopen the row. At or after
  expiry, normal join reuses the ID, clears denial fields and replaces both
  observation timestamps.
- Fixed the archived approval test's broad catch, which could hide an assertion
  failure; both decision matrices now assert archived rejection precisely.

## Live staging proof

Used `builder-canary-aug-6-2026-v3` and the known synthetic applicant. Read-only
preflight found active approval entry, no block, no applicant request/membership/
subscription, and no workflow definition. Prior 2A/2C1/2C3 evidence was retained.
Normal native OAuth verified the distinct founder and applicant fingerprints.
Cached SSO first selected the applicant; that verified client was bound as the
applicant, and the founder then used explicit Google account selection. No
admission call relied on an assumed identity or administrative impersonation.

| Step | Observed outcome |
| --- | --- |
| Ordinary public Join free | One pending request, zero memberships/subscriptions |
| Source boundary at creation | Backend already ran the initial candidate; canonical web still served 2C3. New identified web was loaded and the same pending state rechecked before denial |
| Founder native list/read | Returned the actual pending request and exact observed timestamps |
| Applicant native controls | Existing pending document and protected community context denied |
| Decision | One denial at `2026-10-15T17:55:59.047Z`; one critical denial audit and one completed receipt |
| Discarded response | First native application response discarded without retaining the decision result for recovery |
| Stale cancellation | Attempted the still-visible Cancel request after denial; the denied row survived. No wire-level cancellation response was captured |
| Full founder process restart | PID `27028` exited; PID `45856` used the saved envelope and native stored credentials to recover the original denied result with `deduped: true` |
| Named state after retry | Identical to the committed denial snapshot; original deadline unchanged |
| Founder queue/detail | Pending queue empty; old pending document denied |
| Applicant access | Protected context still denied; own public gate showed Request denied and Oct 22 reapply date |
| Immediate public re-entry | Confirmed web sign-out → Join free → same Google applicant → same denied gate. Named request/history state and deadline unchanged |

The pending row is `kh7ckcn44eejxaqgn2rsr1jrgd8gbfdt`; the operation key is
`staging-2c4-20261015-denial-1`. Natural reapplication eligibility begins at
**`2026-10-22T17:55:59.047Z`**. No clock, stored timestamp or policy was changed.

## Cleanup and proof limits

- Final state intentionally retains one denied request, one denial audit and one
  completed receipt. Applicant membership/subscription rows remain zero. No
  cleanup reset or raw deletion erased the cooldown.
- Named snapshots preserved the prior approval audit/receipt, existing sent
  access-email job and arrival event, community member count, inactive 2A
  membership, 2C1 contribution and empty workflow definition. No new activation,
  email or workflow effects were observed. This is not a census of all tables;
  ordinary session/presence/read-cursor and unrelated worker activity may occur.
- Both native aliases were logged out, all proof processes exited 0, and fresh
  clients reported `notLoggedIn` and rejected protected reads with Auth required.
  User configuration hash was unchanged. Applicant web Account sign-out and its
  confirmation returned to the public home with Sign in. Both created proof tabs
  were closed. Provider-wide grants and old issued tokens were not revoked or
  tested; local disconnect is not that claim.
- Local controlled-time public-flow tests prove the full seven-day boundary at
  expiry minus 1 ms, exact expiry and plus 1 ms; same-ID reopening; stale approve/
  deny rejection; historical denial replay; and a distinct audit for a new
  application decision. **Elapsed seven-day live reapplication is unobserved.**
  A later ordinary join after the recorded deadline can close that evidence gap.
- Concurrency, completion rollback and stale authority are local proofs. The
  live test discarded an application response; it did not inject TCP loss or a
  backend crash. No test-requested model inference ran.
- Existing first-party ID-only decision RPCs retain their compatibility and do
  not acquire the new observed-attempt guarantee. Paid entry, restoration, role
  changes, member removal and broader applicant MCP onboarding remain outside
  this slice.

Ignored screenshot hashes are recorded in structured evidence under
`artifacts/admission-denial-20261015/`: `request-pending.jpg`,
`denial-cooldown.jpg`, `reentry-denied.jpg` and `cleanup-signed-out.jpg`.
No main push, production backend mutation or production release command ran.
