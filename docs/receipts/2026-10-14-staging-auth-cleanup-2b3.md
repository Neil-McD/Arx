# Slice 2B3: bounded auth cleanup

**Passed on staging, October 14, 2026. Production was untouched.**

Deployed runtime: `09e1ca37e7ae0dd3fc48d4cf249526b5ea4c30bc`.
[Machine-readable evidence](evidence/2026-10-14-staging-auth-cleanup-2b3.json)
records the exact candidate gate, served asset identity, public boundaries,
canonical metadata and local screenshot hashes.
[Scope and runbook](../archive/polynet-staging-auth-cleanup-2b3.md).

## Resulting behavior

- Bootstrap, refresh and logout retain one ten-second deadline through response
  headers and body consumption. Delayed headers do not reset the budget.
- Refresh preserves terminal `401` handling even when its error body stalls.
  Other failed/malformed responses remain transient. Unconfirmed logout preserves
  local authentication for retry; only confirmed completion clears it.
- Deleted unused standalone logout wiring, ignored logout arguments, unused
  timeout configuration and the duplicate logout origin guard.
- Active contracts describe the existing Agent page/mobile root, preserve
  authority and harness protections, and bind historical acceptance to its date
  and source. Maintenance instructions correctly describe audit-only defaults.

## Release and verification

| Evidence | Observation |
| --- | --- |
| Exact candidate gate | [Run 38628996471](https://github.com/Neil-McD/Arx/actions/runs/38628996471): expected/head/build SHA all `09e1ca37…`, clean checkout, passed |
| Independent initial PR gate | [Run 38629115945](https://github.com/Neil-McD/Arx/actions/runs/38629115945), passed; subsequent PR checks are owned by GitHub |
| Full suite | **1,681 tests across 192 files**; both dependency audits zero |
| Focused checks | **66 tests across six files**, web/backend typechecks, affected auth/session/MCP/operation/interaction/resource contract proofs, whitespace check |
| Staging release | Git `staging` fast-forwarded from `7d8eb569…` to `09e1ca37…`; [deployment](https://vercel.com/neil-mcds-projects/polynet-staging/3Txyd7APYXEqZj7T7HC1N14oLznN) completed |
| Served identity | Exact runtime SHA, `staging` environment, `/assets/index-BJ5X2HpJ.js`; SHA-256 and both expected backend hosts in JSON |
| Backend | Source tree remains `9dd6ee743bd4869c68047283d38e457bdf600058`; inherited `dev:quick-porcupine-949` deployment retained; no backend release |
| Main / production | Main remains `0a100cfb544851ab06da25f93d8ad549db917ee4`; production web remains `91d28dc2c986ef88a8a507a269db710d6d28d878` |

The receipt commit is documentation only and is not the deployed runtime.

## Public lifecycle proof

One fresh normal Google → WorkOS login used an existing staging test identity in
a dedicated browser tab. No administrative session bootstrap, credential export,
forged identity or injected browser state was used. Read-only administrative
queries corroborated only canonical metadata: hashed user/session-row IDs,
timestamps, refresh generation, revocation and credential/lease presence flags.

| Public sequence | Canonical corroboration |
| --- | --- |
| Login and account reload | Exactly one new session row, same existing user, generation 0 |
| Natural refresh | Same row advanced **0 → 1** at 20:15:15 UTC; initial token expiry 20:16:44 UTC, later expiry 20:20:15 UTC |
| Protected reload after original expiry + 30 seconds | Authenticated account UI; same row and later expiry, observed 20:17:29 UTC |
| Normal confirmation → Signing out → public home | Selected row revoked with reason `logout` at 20:17:45 UTC; credentials, credential expiry and refresh lease erased |
| Signed-out reload and account navigation | Signed-out home persisted; protected account navigation returned to public home; row remained revoked |
| Other sessions | All **24 prior session metadata records** matched their pre-login snapshots |

Unauthenticated HTTP checks independently confirmed `GET /api/auth/session`
returns `200` with `session: null` and `missing_cookie`, `POST /api/auth/refresh`
returns `401`, and missing-cookie logout returns idempotent `200, ok: true`.

## Evidence boundaries

Stalled headers/bodies, failures, lost response and retry are local simulations
through actual consumers/controllers/routes; live staging fault injection is not
claimed. Authenticated responses, cookies, tokens and secrets were not exported.
There is no retained-cookie replay or issued-JWT rejection claim. Provider-wide
logout and external OAuth grant revocation are not certified. The 2B2 external
client proof was not repeated because its backend is unchanged.

The selected revoked row remains audit history. Temporary metadata snapshots
were removed after receipt capture. Screenshots remain local ignored artifacts
under `artifacts/auth-cleanup-20261014/`; only their hashes are committed.
No membership, billing, provider connection or inference changes were requested.
Existing staging background workers were not certified inactive.

Next gate: the independent founder contribution/retry proof. Resource pagination
remains a separate slice.
