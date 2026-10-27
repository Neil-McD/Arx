# Slice 2B3: bounded auth cleanup

Scope: staging web/API only, stacked on 2B2 source `318fdd132`. Canonical main
remains `0a100cfb`; the inherited staged backend is `dev:quick-porcupine-949`
from runtime `7d8eb569`. This slice changes no backend source or provider settings.

Result: passed on staging at runtime `09e1ca37`. The
[dated receipt](../receipts/2026-10-14-staging-auth-cleanup-2b3.md) separates local
bounded-request checks, exact-candidate CI and the live public lifecycle proof.

## Requirements and deletion

Elon step 1: the required outcome is bounded browser authentication with honest
failure/retry behavior. Fetch completes at response headers, so clearing its
deadline there does not bound JSON/error-body consumption. One ten-second budget
must cover bootstrap, refresh and logout; their HTTP classifications remain
distinct. These requirements come from the existing admission/session contracts
and the reproduced stalled-body defect.

The highest avoidable effort is a new auth broker or request framework. The
credible minimum is the existing helper plus in-deadline response consumption.
Effort rankings are qualitative, not measured ratios.

Step 2 deletes the unused standalone public-route logout callback/input, ignored
logout token/scope arguments, duplicate logout origin-check implementation and
unused per-caller timeout configuration. Existing logout checks and web typecheck
verified that deletion before the remaining helper was simplified.

Step 3 retains one private same-origin request helper. It passes the same abort
signal through fetch and keeps the deadline active until its consumer finishes
reading the body. Headers do not reset the budget. No new public client contract,
credential store, provider lifetime or session-row owner is introduced.

| Request | Outcome |
| --- | --- |
| Bootstrap | Existing provider/parser failures reject; stalled body is aborted at the deadline. |
| Refresh | `401` remains terminal even with a stalled error body; other HTTP failures, malformed success and body failures remain transient. Missing headers retain `auth_gateway_unavailable`. |
| Logout | Only confirmed `ok: true` succeeds. Body failure/timeout rejects and preserves local authentication for retry. |
| Public logout API | Existing five-second bridge deadline and cookie-retention behavior remain; the route reuses the shared origin guard. |

Active contracts now describe the existing desktop Agent page/mobile Agent root
and retain harness, community scope, funding and authority protections. Historical
acceptance remains dated/source-bound instead of claiming an unspecified current
SHA. Session-maintenance documentation correctly describes audit-only defaults
and its production target; the maintenance script is not executed for this slice.

## Verification and staging release

1. Test the real client consumers with partial response streams: no headers,
   stalled success/error bodies, delayed headers plus body under one budget,
   completed bodies, malformed payloads and unchanged HTTP classifications.
2. Verify local authentication survives a body timeout and confirmed retry clears
   it. Retain lost-response retry, late-refresh fencing, modal error and server
   revocation tests. Verify origin/method/missing-cookie behavior.
3. Run web/backend typechecks, auth/session/MCP and affected contract proofs.
   Require the canonical release gate on the exact clean candidate before release.
4. Fast-forward only the Git `staging` branch for its Git-connected web release.
   No Convex deployment is needed because backend source is unchanged. Confirm
   the served SHA and both expected staging backend hosts; record main and
   production identity read-only before/after.
5. Use a dedicated staging browser tab and the existing test identity for fresh
   public Google/WorkOS login, authenticated reload, natural expiry/refresh,
   normal logout and signed-out reload/protected navigation.
6. Corroborate only canonical metadata: hashed user/session-row identifiers,
   creation/expiry, refresh generation and revocation/secret-presence flags.
   Do not export cookies, JWTs, encrypted secrets or refresh tokens. Preserve
   unrelated rows and memberships; retain the selected revoked row as history.
7. Save sanitized evidence and local screenshot hashes. Keep fault simulations,
   native/web UI observations and canonical metadata as separate evidence classes.

The live normal lifecycle does not certify live stalled-network injection,
provider-wide logout, external-grant revocation or rejection of issued JWTs.
Resource pagination and the independent founder contribution/retry proof remain
separate slices. Production is outside this release.
