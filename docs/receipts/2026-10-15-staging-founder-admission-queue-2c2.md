# Slice 2C2: bounded founder admission queue

**Scoped staging acceptance passed, October 15, 2026. Applicant consent and
native denial checks are now complete. Production was untouched.**

[Structured evidence](evidence/2026-10-15-staging-founder-admission-queue-2c2.json).
[Approved scope](../archive/polynet-staging-founder-admission-queue-2c2.md).
[Draft PR #172](https://github.com/Neil-McD/Arx/pull/172).

## Runtime and verification

| Boundary | Evidence |
| --- | --- |
| Validated runtime / serving Git staging | `a4319529c90bde037e251e095aa20c3a55318ab3` |
| Exact clean candidate gate | [Run 38765421520](https://github.com/Neil-McD/Arx/actions/runs/38765421520): passed; 1,699 tests across 192 files, both audits zero |
| Backend | Explicit `convex dev --once --typecheck enable` to `dev:quick-porcupine-949`, exit 0 |
| Backend source tree | `eadbf3e72539b251c9473145793d71403ea20268` at the validated candidate; deployment source provenance, not a remote commit attestation |
| Web release | Git staging fast-forward; [staging deployment](https://vercel.com/neil-mcds-projects/polynet-staging/Cpk8zQiixH26PU1kr5A9h1wFJJnB) completed; served SHA and bundle both match staging |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4`, unchanged |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged; no production release command |

The receipt commit is documentation only and is not the deployed runtime.
PR-head checks and exact runtime-candidate checks are separate evidence.

## What changed

Existing `polynet_list` and `polynet_read` expose the private
`/communities/<slug>/builder/join-requests/` directory and returned request
`<request-id>.md` paths. There are still five tools. The existing admission domain
owns indexed pending pagination and exact reads; current manager authorization
runs on every call. Default 20, bounds 2–50; continuation is scoped to actor,
community and query. Cursors and document IDs confer no authority.

Only canonical pending request references, public applicant references, status
and timestamps are projected. Pair ambiguity and malformed legacy rows fail
closed without repair. Emails, free-text messages, decisions and access grants
are excluded. The directory is non-writable and non-searchable. Existing
first-party moderator operations are unchanged.

Step 1 questioned the scope and ranked new tools, SDKs, roles and generic admin
infrastructure as avoidable work. Step 2 excluded those and all admission writes.
Step 3 implemented and verified the remaining adapter. No acceleration or
additional automation was introduced.

The first candidate failed the verified-identity guard because its text scan
mistook internal required actor IDs for public caller requirements. The guard
now checks public query/mutation/action arguments, with adversarial public,
optional and internal examples. It still rejects required caller IDs on public
operations. The corrected candidate passed the complete gate. This was a guard
scope correction, not a relaxation of runtime authentication.

## Live acceptance and cleanup

| Gate | Result |
| --- | --- |
| Native founder | Normal OAuth completion; canonical fingerprint matches 2C1; current builder/owner authority |
| Discovery / empty queue | Builder listing returned the queue; empty list terminated with null cursor |
| Public fixture | Existing test applicant used Join free on `builder-canary-aug-6-2026-v3`; UI showed Request pending; canonical state was exactly one pending request and zero memberships/subscriptions |
| Nonempty native list/read | Returned the same canonical request and public applicant; exact minimal fields; repeated list/read and fresh conversation were identical |
| Private boundaries | Native wrong-community detail, inaccessible-community queue and queue search denied |
| Applicant domain boundary | Both live internal domain readers returned `community_forbidden` for the actual applicant ID; separate administrative observer evidence |
| Native applicant/member completion | Approved consent, verified exact applicant fingerprint; former applicant and current ordinary member both denied builder/queue list and document probes; fresh conversation and process restart retained denial |
| Positive member control | The same native identity successfully listed `workflow-member-browser-qa-sep23` with current member/member authority before private-path denial |
| No read effects | Named canonical fixture/history snapshots were identical during native reads and boundary calls |
| Cancellation | Applicant used Cancel request; queue became empty and old exact detail denied; canonical fixture returned exactly to its baseline |
| Retained history | Earlier revoked membership stayed inactive and unchanged; 2C1 contribution stayed unchanged |
| Local disconnect | Both test aliases logged out; exact Keychain items absent; all proof processes exited; fresh process reported `notLoggedIn` and protected queue access required auth; user configuration hash unchanged |
| Web cleanup | Account > Sign out > confirmation returned to signed-out landing with Sign in link |

The initial applicant enrollment reused the founder's AuthKit session. Identity
checking rejected it before it counted as an applicant control; first-time
applicant consent was initially left untouched and cancelled. The user then
explicitly authorized that exact grant and requested completion.

At 16:40 UTC the resumed native flow used fresh account selection and the normal
Google sign-in. The consent screen identified the test applicant and the expected
identity/profile/email/ongoing-access scope; Allow access was clicked under that
explicit authorization. Native completion and canonical profile fingerprint
`0443a57360b984c5d1cd38a8c2c078fb77c48ef3198dc535c37775b5e7b51bfc`
matched. All six builder/queue list and document probes returned non-enumerating
`semantic_not_found`. The positive member control independently established
current ordinary-member authority. A fresh conversation and restarted process
retained denial with the same canonical identity and no new login.

Native logout removed the test credential again; both exact test Keychain items
were absent. A fresh process reported `notLoggedIn` and protected queue access
required auth. Every proof process exited and the user configuration hash stayed
unchanged. The OAuth tab was closed; no new Polynet web session or admission
fixture was created. Named admission/access/history snapshots stayed identical.
Local removal does not certify upstream grant revocation.

Foreground browser control was interrupted by another active workflow. Explicitly
claiming the empty test tab allowed isolated completion. Transient DOM inspection
timeouts did not prevent the callback screenshot from showing Authentication
complete; native completion and authenticated identity checks independently
corroborated success. No unrelated authorization control was operated.

The browser-tab service initially failed to load its request-header policy;
normal native Chrome control completed the founder/public-funnel flows. No
browser warning, callback or permission bypass was used. Local ignored screenshots
show the pending and cancelled public fixture; their hashes are in the JSON.

## Verification limits

- 89 focused executor/admission tests passed, including advancing pages,
  termination, default 20 with 21 rows, bounds, foreign/malformed cursors,
  owner/admin success, member/moderator/applicant/outsider/community-agent denial,
  role/entitlement/block/archive changes, wrong-community and cancelled/decided/
  malformed/ambiguous exact reads, no read repair and no decision/write surface.
  Semantic repository, MCP surface/auth/profile and operation proofs passed;
  both typechecks passed. Full candidate gate passed separately.
- Live pagination contained one request. Multi-page coverage is local evidence.
- The follow-up applicant's original request was already cancelled. Native
  document-denial probes used a syntactically valid nonexistent selector; they
  do not certify access denial for a currently existing pending record. Earlier
  live founder reads cover an existing record, and local role tests cover
  existing-row denial. No second fixture or membership change was introduced.
- Session setup and normal navigation may write session/presence/read-cursor
  state. Snapshot equality covers the named admission/access/history fixtures,
  not all staging tables. No inference, approval, denial, billing change,
  membership grant, role change or community policy edit was performed.
- Local credential removal does not prove provider-wide grant revocation or
  rejection of already issued tokens. Provider/Google sessions were not globally
  revoked. Existing staging background workers were not certified inactive.

No gate remains for this bounded read-only slice. Admission decisions, notifications,
and membership changes remain a separately scoped future contract. Runtime source
and deployment were unchanged during this follow-up; only receipt/plan documents
were updated. The existing exact-candidate gate remains the runtime validation.
