# Slice 2A: authenticated staging context acceptance

**Passed on staging, 2026-10-14.** Real, distinct member and builder bearers
passed the bounded public MCP context suite. Revoking only the disposable
member's grant denied its next community requests with the same still-valid
bearer. No runtime code or deployment changed in this slice.

[Machine-readable evidence](evidence/2026-10-14-staging-context-2a.json) contains
timestamps, identity fingerprints, unchanged token hash/expiry, fixture paths,
source hashes, revocation pre/postconditions and sanitized results.
[Runbook](../archive/polynet-mcp-context-acceptance.md) defines the bounded procedure.

## Provenance

| Evidence | State |
| --- | --- |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4` |
| Deployed staging runtime | `6ae69677964ccd599870de81afed9a45be4ca805`, checked through `version.json` in each run |
| Backend | `dev:quick-porcupine-949`; package 1 deployment provenance, no redeploy here |
| Harness commit | `60357434fc8a4ddba7f19fd43a501ae613360c6b` |
| Executed harness source | Run before commit; bytes match that commit, hashes recorded |
| Positive suite | `17:22:16Z`–`17:22:24Z` |
| Revoked suite | `17:22:50Z`–`17:22:53Z` |
| Same member bearer expiration | `17:25:22Z`, after both suites completed |

Two existing staging identities signed in through real Google → WorkOS browser
flows in separate sessions. Browser tooling blocked navigation to the session
response, so administrative staging access to the existing internal
`authSessions:bootstrapAuthSessionInternal` retrieved/refreshed their actual
provider-issued bearers. This may update session continuity/diagnostic records
and refresh tokens. Public actor queries verified the canonical users, and the
public MCP verified their JWTs normally. No fabricated identity or admin
impersonation was substituted for the tested bearer requests.

This administrative acquisition step does **not** certify public external
OAuth client enrollment/PKCE or full refresh/logout behavior. Those remain 2B.
Temporary credential/session files were removed after evidence capture; active
browser sessions were not logged out by this slice.

## Live outcomes

| Boundary | Result |
| --- | --- |
| Unauthenticated MCP challenge and protected-resource metadata | Passed |
| Authenticated five-tool discovery for both users | Passed |
| Distinct canonical users and server-derived member/builder lanes | Passed |
| Caller-bound self-context | Passed |
| Public resource read → search → returned-path read | Passed for both users |
| Actual member's builder dossier | Builder read succeeded; member denied |
| Restricted-channel document | Builder read contained canary; member denied |
| Exact restricted-channel search | Builder found canary/document; member denied |
| Broad member chat search | No private canary results or snippets |
| Existing control-only community B | Builder list/read succeeded; member list/read denied |
| Revocation with unchanged bearer | Global profile still authenticated; A list, self-context, resource read and search denied |
| Independent builder after revocation | Public resource read remained healthy |

The first complete positive attempt stopped at a deliberately strong control:
the builder's broad chat search did not find private content. Source inspection
confirmed that broad chat search scans shared channels even for managers. The
harness was corrected to search the exact restricted channel for its positive
control and member denial; broad member search separately checks omission.
No runtime authorization rule was changed to make the proof pass.

## Fixture effects and validation

Existing disposable A: `join-refresh-qa-sep23`; builder-only B:
`builder-canary-aug-6-2026-v3`. Added one live synthetic module/resource and one
restricted channel/interaction with synthetic canaries. The initial setup
stopped on a channel-list DTO mismatch after resource creation; resuming reused
that resource/module. Fixture setup used existing domain APIs and real builder
authority. No agent mentions/replies or member workflow automations were used.

Immediately before canonical removal, the selected ordinary membership was
active, `free_grant`, and had **zero** subscription rows in both membership and
community/user indexes. `communityAdmin.removeCommunityMember` returned
`ok: true`, `stripe_canceled_count: 0`. Canonical state then showed
`active: false`, a revocation timestamp and `removed_by_manager`. The revoked
membership and synthetic fixture history remain as audit evidence; no
reactivation/restoration is claimed.

- **68 focused tests passed:** 17 harness and 51 canonical executor tests.
- Strict typechecking passed for the three harness/test scripts.
- MCP surface, MCP authentication and profile MCP static proofs passed.
- Whitespace/diff validation passed.

The observation harness invoked only list/read/search; retrieval evidence may
be recorded. Fixture setup and one membership revocation were separate writes.
No test-requested inference, billing change, provider connection, production
release or runtime implementation change occurred. Existing staging background
workers were not stopped or certified inactive.

## Next gate

Slice 2A establishes the tested headless context boundaries. Slice 2B should
prove public session refresh/logout and a genuine external-client OAuth flow.
Then a minimal independent founder client can prove one contribution and retry
behavior through existing canonical owners. Broader endpoint design and UI
deletion remain outside this completed slice.
