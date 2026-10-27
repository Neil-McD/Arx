# Slice 2C3: fresh free admission and safe retries

**Scoped staging acceptance passed October 15, 2026. Production was untouched.**

[Structured evidence](evidence/2026-10-15-staging-founder-admission-approval-2c3.json).
[Approved scope](../archive/polynet-staging-founder-admission-approval-2c3.md).
[Draft PR #173](https://github.com/Neil-McD/Arx/pull/173), stacked on #172.

## Release identity and checks

| Boundary | Evidence |
| --- | --- |
| Runtime candidate / Git staging / served staging | `76b83959942c65392b7ce0a12fb15f6726f6f453` |
| Exact clean local gate | CI mode, candidate/head/build match; all 15 steps passed; 1,735 tests / 192 files; both dependency audits zero |
| Remote candidate gate | [Run 38773842838 passed](https://github.com/Neil-McD/Arx/actions/runs/38773842838) |
| Backend | Explicit `convex dev --once --typecheck enable --env-file /tmp/polynet-package-1-staging.env`, exit 0; `dev:quick-porcupine-949` |
| Backend source tree | `e9dbb94b93b29f11d05d7ed9f05fb516ea9500ef`; clean candidate deployment provenance, not remote commit attestation |
| Staging web deployment | [Git staging deployment](https://vercel.com/neil-mcds-projects/polynet-staging/FuNn1VxLLiRqCK4j4YDiVA2Q4JRt) |
| Live bundle | `/assets/index-DhORBc0B.js`; SHA-256 `111a3c3ef487eaaa12ff179afa0910450c85a602718a3cdc14191216dd1efbe8`; expected staging Convex cloud/site hosts embedded |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4`, unchanged |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |

Receipt updates are documentation only and are not the deployed runtime. Vercel
PR preview checks are distinct from the canonical production deployment.

## Implemented contract

`community.admission.approve`, version 1, is discoverable through existing
`polynet_list`/`polynet_read` and invoked through existing `polynet_call`. There
are still five public tools. The exact capability target, canonical request ref,
observed creation/update timestamps and idempotency key are required.

Current human owner/admin authority is checked by the admission domain before
both execution and completed-receipt replay. The operation accepts only a current
unique pending request in an approval-gated community, for an unblocked non-owner
with no existing membership or subscription in that community. It cannot restore
old roles/access, approve paid entry, deny, make bulk decisions or change policy.

One domain transaction reserves the existing canonical operation receipt, uses
the existing activation owner, records critical approval audit and completes the
historical result. Completion failure rolls back the grant. No new table,
generic membership writer, notification engine or public tool was introduced.
The original first-party moderator contract remains compatible.

## Live proof

Community: `builder-canary-aug-6-2026-v3`. Existing founder and synthetic applicant
were matched to their known canonical identity fingerprints. Read-only preflight
found approval entry, active lifecycle, no block, no applicant membership/request/
subscription rows, verified applicant email and no join workflow. Existing sender
configuration was present and its public application link targeted staging.

| Step | Observed result |
| --- | --- |
| Public funnel join | Exactly one canonical pending request; no membership or subscription |
| Native founder | Discovered capability; listed and read the returned pending document |
| Native applicant before approval | Actual applicant identity denied the **existing pending document** and protected community root |
| Approval at 17:09 UTC | One ordinary free member, activation sequence 1; one approval audit, one arrival event, one completed receipt, one access-email job |
| Applicant after approval | Native community root succeeded with member/member authority; founder queue still denied; web showed Enter community and opened General |
| Queue after approval | Empty; old pending document denied |
| Discarded first response | Successful application response discarded without retaining its decision result for recovery |
| Fresh founder process/conversation | Same actor/key returned the original membership and decision with `deduped: true`; named domain state unchanged and same email job |
| Normal leave | Member used community settings → Leave community → native confirmation OK; new membership removed through existing lifecycle |
| Replay after leave | Same historical approval returned; membership stayed absent and actual applicant context denied before and after replay |

The live proof contains one grant. It does not certify a real TCP interruption,
live receipt-lease reclaim or live concurrent decision race. Those are distinct
from deliberately discarding an application response.

## Notifications, cleanup and evidence limits

- The normal access-granted email job advanced from `pending` to `sent`, with
  one job throughout retry and cleanup. This is outbox/provider-send evidence;
  mailbox receipt or delivery was not tested. No new sender, content policy or
  recipient was configured. The quiet fixture exercised no join workflow or
  model inference.
- Normal non-platform-home leave deletes membership. Final applicant membership,
  request and subscription rows are zero. Approval audit, completed operation
  receipt, member-joined activity and sent email evidence remain intentionally.
- The prior 2A revoked membership remains inactive and byte-for-byte unchanged;
  the prior 2C1 contribution remains unchanged. No old fixture was restored.
- Both isolated native clients exited normally. CLI logout removed only
  `polynet_2c3_staging` and `polynet_2c3_applicant_staging`; their exact Keychain
  items were absent. A fresh native client reported `notLoggedIn` and the
  protected queue required authentication. User config hash was unchanged.
- The applicant web session signed out through Account and its confirmation;
  native browser state showed the public home with Sign in. Provider-wide Google/
  AuthKit grants were not globally revoked. Local credential removal does not
  prove upstream grant revocation or rejection of a previously issued token.
- Initial native applicant SSO selected the cached founder; fingerprint checking
  caught it before any admission call. That local credential was removed and
  explicit Google applicant selection completed using the existing grant. A
  fresh process independently verified the real applicant before boundary proof.
- Browser DOM navigation intermittently stalled at Google and its leave dialog.
  Native UI controls and independent server observations verified the actual
  outcomes. An initial leave attempt did not remove membership; no post-leave
  claim was made until the real native confirmation and subsequent denial checks.
- Local coverage: 131 focused tests, including 36 new executor cases for owner/
  admin success, actor and direct-domain denial, eligibility/version conflicts,
  authority/funding/lifecycle changes, same-ID reapplication, different-key/actor
  and first-party races, rollback, lost response and no reactivation. Both
  typechecks, identity, semantic and operation proofs passed. Full gate evidence
  is separate above; concurrency/rollback/stale-role cases were not live effects.
- Normal navigation can write session, presence and read-cursor state. Snapshot
  equality covers the named admission/access/history records, not all staging
  tables or unrelated background workers.

Local ignored screenshots include `request-pending.png`, `approval-visible.png`,
`member-access.png` and `cleanup-gate.png` under
`artifacts/admission-approval-20261015/`; their hashes are in structured evidence.
No main push, production backend mutation or production release command ran.

The next separately scoped decision is denial/cooldown/reapplication. Paid
admission, membership restoration, role changes and bulk policy remain outside
this completed slice.
