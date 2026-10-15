# Slice 2B1: truthful logout and public session lifecycle

Scope: staging only. Polynet keeps one server-owned session row and the existing
refresh generation/lease protocol. This slice corrects logout completion and
verifies the normal public web flow; it does not change authentication providers,
memberships, billing, external-client OAuth enrollment or production.

## Requirements and implementation

Elon step 1: canonical revocation is the required outcome. Browser clearing and
upstream provider sign-out are supporting operations, not evidence of that
outcome. The highest avoidable effort is an auth redesign or second identity
plane; both are excluded. Effort rankings are qualitative, not measured ratios.

Step 2 removes swallowed failures and premature local clearing. Step 3 keeps
the existing bridge, canonical revocation/zeroization owner, refresh lease and
epoch fencing, with explicit bounded waits and one retry path.

| Boundary | Contract |
| --- | --- |
| Canonical logout | Revoke/erase first. Provider logout is bounded best effort (2 seconds). Missing/revoked sessions are idempotent; invalid replacement chains are unconfirmed. |
| Public same-origin route | Require successful bridge completion. A failed/malformed response or 5-second deadline yields `503, logout_unconfirmed`; retain the opaque cookie for retry. |
| Client | Reject an unconfirmed response or 10-second request deadline. Preserve local authentication until confirmation. |
| Presentation | Keep the confirmation dialog open with an accessible error and enabled retry. Clear local authentication and run completion hooks after confirmation. |
| Concurrency | Prior refreshes cannot undo logout; superseded completion cannot clear a newer controller epoch. |

Canonical session logout prevents further credential issuance from that session.
It does not by itself prove immediate rejection of already-issued JWTs or logout
of other provider sessions/external harness grants.

## Validation before release

Focused tests exercise the actual route, client and controller, plus canonical
session actions: bridge failures/malformed responses, lost response and retry,
timeouts, retained local state, late refresh, accessible error rendering,
provider failures, credential/lease erasure, idempotency, invalid chains,
unrelated-session preservation and post-logout bootstrap/refresh denial.

Run web/backend typechecks, session kernel/retention/account-resume contract
proofs and the canonical release gate on an identified clean candidate. Local
simulations are not live public lifecycle evidence.

## Staging release and public acceptance

1. Keep the change separate from the completed context harness. Record canonical
   main, parent head, candidate SHA, stage web identity and explicit backend
   `dev:quick-porcupine-949`; record production identity read-only.
2. After the candidate passes the gate, intentionally deploy the changed backend
   using the explicit staging selector. Advance only the staging Git branch for
   its Git-connected web release. Verify the served SHA and backend host. Do not
   push main, invoke a production release or change provider configuration.
3. Use a dedicated staging browser tab and one fresh login for an existing test
   identity. Exercise the real public sign-in/callback/application flow.
   Administrative credential bootstrap, impersonated identities and injected
   browser state do not count as public acceptance.
4. Corroborate the selected fresh session through read-only canonical metadata:
   hashed session/user identifiers, creation/expiry, refresh generation and
   revoked/credential-presence flags. Do not read encrypted secret contents or
   print/store raw cookies, JWTs or refresh secrets in evidence.
5. Reload and verify authenticated account identity. Observe refresh continuity
   past the initial credential's natural expiry and verify protected account UI,
   a later credential expiry/generation and the same canonical session row.
   Do not change clocks, shorten provider lifetimes or mutate the row to force
   the outcome.
6. Sign out through the public confirmation UI. Verify signed-out state and
   reload, canonical `logout` revocation, absent encrypted credentials/lease,
   and public missing-session behavior. Keep direct HTTP/header observation,
   UI behavior, canonical metadata and local failure tests as distinct evidence.
7. Retain the revoked session as audit history. Do not revoke other sessions or
   reactivate fixture memberships. Remove private temporary metadata files.

The receipt must state exactly which public requests or UI outcomes were
observable. A tool-blocked session response is not a product failure and cannot
be replaced by administrative bootstrap while claiming public proof. If that
prevents a required observation, record the incomplete gate plainly.

Next: 2B2 external-client OAuth enrollment/continuity, then an independent founder
client contribution/retry proof. Neither is part of this slice.
