# Slice 2B2: native external-client OAuth enrollment and continuity

**Passed on staging, October 14, 2026. No runtime or provider changes were needed.**

Native Codex enrolled once through WorkOS CIMD, retained authenticated context
across a new conversation and full process restart, refreshed through its own
expiry lifecycle, and failed closed after local disconnect.

[Structured evidence](evidence/2026-10-14-staging-external-oauth-2b2.json).
[Execution runbook](../archive/polynet-staging-external-oauth-2b2.md).

## Provenance and ownership

| Item | Verified value |
| --- | --- |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4` |
| Parent source/2B1 receipt head | `cd408d177d592dceca4879dd225484f9bc061b3b` |
| Serving staging runtime | `7d8eb5693092692ed4c44e74505f5b8f04cfde1f` |
| Backend | `dev:quick-porcupine-949` |
| Exact OAuth resource | `https://polynet-staging.vercel.app/runtime/mcp` |
| Authorization issuer | `https://sparkling-artist-49-staging.authkit.app` |
| Native client | Codex app-server `0.162.0-alpha.17.2` |
| Test alias/store | `polynet_2b2_staging`, native Keychain |
| Production build | `91d28dc2c986ef88a8a507a269db710d6d28d878`, checked read-only |

WorkOS's own discovery advertised CIMD and DCR. Native automatic discovery
selected CIMD and requested S256 PKCE, the exact staging resource, and
`openid profile email offline_access`. Polynet's mirror omits the registration
capabilities; that omission did not block the tested issuer-discovery path.
No metadata change, custom broker, provider replacement or DCR provisioning was
necessary.

The test used process configuration overrides, disabled unrelated native MCP/apps
in that process, and never modified the user's configuration file. Its SHA-256
matched before and after. One existing staging builder signed in through Google
and WorkOS. No administrative bootstrap, forged identity, pasted bearer, copied
credential store or inference turn drove acceptance. Direct native app-server
RPC exercised the existing transport; no `turn/start` was invoked.

## Live acceptance

Times below are UTC, October 14, 2026.

| Gate | Observed outcome |
| --- | --- |
| Enrollment, credential creation at 19:08:11 | Native `mcpServer/oauthLogin/completed` reported success. Connected native inventory showed OAuth and the five canonical tools. |
| Authenticated context | Profile fingerprint matched the prior 2A builder; community self-context resolved the same user; authority was `builder/owner`; existing synthetic resource canary was readable. |
| Real denial control | Read-only canonical metadata confirmed an existing active community with no caller ownership or active membership. Its self-context returned `semantic_not_found`. |
| New conversation, 19:10:40 | New ephemeral conversation read the same identity and canary without login. |
| Full process restart, 19:12:05 | Process `62951` terminated; replacement process `67189`, corroborated by native diagnostics, read the same identity and canary without login. |
| Native credential update, 19:15:14 | Non-secret Keychain record modification time advanced during a native authenticated read; no second login. |
| Explicit expiry refresh, 19:20:14–19:20:15 | Native lifecycle trace reported `refresh_reason="expiry"`, requested credentials from WorkOS, received them and persisted them successfully. |
| After refresh, 19:20:16–19:20:58 | Authorized canary, canonical profile and identity-bound self-context remained readable. The inaccessible-community control still denied. |
| Local disconnect, by 19:21:25 | Native logout removed the test credentials; the exact Keychain item was absent. A fresh native process reported `notLoggedIn` and rejected protected reads with `Auth required`. |

The synthetic resource and earlier revoked membership fixture were retained
unchanged. Only list/read operations were invoked. Read paths can record normal
retrieval evidence; existing background workers were not certified inactive.

## Evidence boundaries

Natural refresh was directly observed through the native client's expiry-triggered
provider transaction and persistence diagnostics, followed by authenticated
reads. Exact initial JWT `exp` and token-response bodies were not exported.
The earlier credential modification timestamp supports continuity but is not,
by itself, the expiry proof. Optional secret-backed expiration inspection was
unavailable under OS Keychain access controls; those controls were not weakened.

Chrome blocked rendering the final loopback page with `ERR_BLOCKED_BY_CLIENT`.
The native callback had already completed successfully. Authenticated native
reads independently corroborated the login; no browser warning was bypassed or
callback replay injected. The final browser page remains a separately recorded
UI limitation, not a claimed success screen. Its screenshot is a local ignored
artifact; the structured receipt records its hash.

Local disconnect certifies removal of the selected client's stored credentials
and denial in a fresh process. It does not certify upstream grant revocation,
rejection of already-issued JWTs, provider-wide logout or other-client logout.
Canonical web `authSessions` rows were not used as external-client proof.

## Changes and validation

Only operational documentation and evidence changed. The setup guide removes
mandatory dual-registration assumptions, requires authenticated reads instead
of tool-list-only acceptance, distinguishes configuration isolation from named
profiles, and separates external grants from web-session logout.

Workspace MCP, MCP auth and profile contract proofs passed. Diff/JSON/evidence
checks and remote validation are recorded in the structured evidence. The
existing deployed 2B1 runtime remains in place. GitHub created ordinary PR
previews; neither canonical staging nor production was released. No provider
settings, membership or billing changes were performed. The receipt captured
remote CI while pending; [PR #169](https://github.com/Neil-McD/Arx/pull/169) owns
the current check status. Local proof and remote validation are separate gates.

Next: an independent founder client contribution/retry proof. Claude Code
compatibility is a separate client gate, not implied by this native Codex result.
