# Slice 2B1: truthful logout and public session lifecycle

**Passed on staging, October 14, 2026. Production was untouched.**

Deployed runtime: `7d8eb5693092692ed4c44e74505f5b8f04cfde1f`.
[Machine-readable evidence](evidence/2026-10-14-staging-session-2b1.json) records
the exact-commit gate, deployments, public boundaries, canonical metadata and
local screenshot hashes. [Runbook](../archive/polynet-staging-session-lifecycle.md).

## Resulting behavior

- Public logout requires confirmed canonical completion. Failed/malformed bridge
  responses or timeout report `logout_unconfirmed` and preserve the opaque
  cookie for retry, including a lost completion response.
- The client preserves local authentication until confirmation. Failure remains
  visible in the confirmation dialog; confirmed completion clears local state
  and runs existing completion hooks. Late refresh remains fenced.
- Canonical revocation erases credentials and leases before bounded best-effort
  provider logout. Missing/revoked sessions are idempotent; an invalid legacy
  replacement chain cannot falsely report confirmed completion.
- Existing session rows, refresh generations, lease coordination, authentication
  providers, memberships and framework architecture remain in use.

## Candidate and release evidence

| Evidence | Observation |
| --- | --- |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4`; not pushed |
| Parent 2A.1 head | `77c4ae47ca04e5ec461d4afaba9def3321aa8d47` |
| Exact runtime gate | [Run 38613970891](https://github.com/Neil-McD/Arx/actions/runs/38613970891), clean checkout with expected/head/build SHA all equal to `7d8eb569…` |
| PR gate | [Run 38613707221](https://github.com/Neil-McD/Arx/actions/runs/38613707221), independently passed |
| Full suite | **1,663 tests across 191 files**, both dependency audits zero |
| Focused suite | **45 tests across four files**, actual route/client/controller and canonical session actions |
| Typechecks/proofs | Backend/web typechecks, session kernel/retention/account-resume proofs and diff check passed |
| Backend deployment | Explicit `dev:quick-porcupine-949`; functions ready at 2:26 p.m. EDT; tracked source clean before/after |
| Backend source tree | `9dd6ee743bd4869c68047283d38e457bdf600058` |
| Web release | Git `staging` fast-forwarded from `6ae696779…` to `7d8eb569…`; [staging deployment](https://vercel.com/neil-mcds-projects/polynet-staging/CKa7zhHmTZ2tp5fx3cvXHHiUbSEQ) completed |
| Live web identity | `version.json` reports the exact runtime SHA and `staging` environment |
| Serving asset | `/assets/index-D2GDmu8R.js`, SHA-256 `159deb4674f4e643772b3d44276ebd1520dbfae7f442cc6c7f4bcd78777aa121`; embeds both expected `quick-porcupine-949` backend hosts |

Backend source provenance comes from the exact clean candidate and successful
explicit deployment; metadata alone is not a backend commit attestation.

## Public lifecycle proof

Used one fresh public Google → WorkOS login for an existing staging test identity
in a dedicated browser tab. Credentials stayed in the browser. No administrative
session bootstrap, bearer extraction, forged identity or injected browser state
was used. Administrative queries corroborated only canonical metadata: hashed
user/session-row IDs, timestamps, refresh generation and presence/revocation flags.
Opaque cookie IDs and encrypted secret contents were not returned.

| Public sequence | Canonical corroboration |
| --- | --- |
| Fresh login and authenticated account settings | Exactly one new row; generation 0; user fingerprint matches the existing test identity |
| Reload | Same user and row, still authenticated; no replacement session |
| Natural credential expiry at 2:33:16 p.m. EDT | No clock/lifetime/data manipulation |
| Account reload after expiry, observed at 2:34:11 p.m. | Protected account UI remained authenticated; same row, generation **0 → 1**, later credential expiry at 2:36:47 p.m. |
| Normal confirmation → Signing out → public home | Selected row revoked with reason `logout` at 2:34:34 p.m.; credentials, credential expiry and refresh lease erased |
| Signed-out reload and account navigation | Public signed-out home persisted; account navigation returned to public home; row remained revoked |
| Other sessions | All **23 prior session metadata records** matched their pre-login snapshots |

Live HTTP checks without a cookie separately confirmed: `GET /api/auth/session`
returns `200` with `session: null` and `missing_cookie`; `POST /api/auth/refresh`
returns `401`; `POST /api/auth/logout` returns idempotent `200, ok: true`.

Local simulations cover failure, malformed response, lost response/retry,
timeouts, preserved local state, late refresh, accessible errors, provider
failure/timeouts, zeroization, idempotency, invalid chains and post-logout
bootstrap/refresh denial. These are not live staging fault-injection claims.

## Evidence limits and boundaries

The authenticated public flow was observed through real UI outcomes backed by
canonical metadata. Authenticated response bodies, cookies and headers were not
exported. Cookie clearing is covered by route tests and signed-out reload/account
behavior; no direct replay of the former cookie is claimed. Already-issued JWT
rejection, provider-wide logout and external-harness grant revocation were not
measured and are not implied by session revocation.

The selected revoked row remains audit history. Private temporary metadata files
were removed after capture. Screenshots remain local ignored artifacts under
`artifacts/session-lifecycle-20261014/`; hashes are in the JSON. No screenshots
containing account metadata were uploaded to GitHub.

No membership/billing changes, provider connections or inference were requested.
Existing staging background workers were not certified inactive. Production web
still serves `91d28dc2c986ef88a8a507a269db710d6d28d878`; no production backend
deployment or direct Vercel production release was performed.

Next gate: **2B2, real external-client OAuth enrollment and continuity**.
