# Slice 2B2: external-client OAuth enrollment and continuity

Scope: one native Codex client against `https://polynet-staging.vercel.app/runtime/mcp`
and `dev:quick-porcupine-949`. WorkOS remains the authorization server; Polynet
remains the resource server and canonical community authority. The client owns
credential persistence and refresh. Web sessions are a separate lifecycle.

## Requirements

Elon step 1 questions and ranks the requirements before changing authentication.
Rankings are qualitative effort estimates, not measured ratios.

| Requirement | Source | Effort against minimum |
| --- | --- | --- |
| Native enrollment, new conversation, restart and normal refresh | Existing hosted MCP continuity invariant | Required proof |
| Canonical self identity, authorized synthetic context and real denial control | Per-request community authority invariant | Required bounded reads |
| Staging endpoint and credential isolation | Staging-only authorization | One distinct alias plus process configuration overrides |
| Custom OAuth broker, credential copying or provider replacement | No demonstrated dependency | Highest avoidable effort; exclude |
| Every external harness and mandatory support for both registration methods | One native-client outcome requires one working method | Defer client matrix; remove mandatory dual-registration assumption |
| Metadata-mirror redesign | Clients discover the advertised issuer | Change only if native discovery demonstrates a defect |

Step 2 removes weak tool-list-only acceptance and unnecessary setup requirements.
Step 3 uses the existing native transport and credential store. No runtime change,
provider reconfiguration, lifetime/clock manipulation or new automation is
required when the normal path works.

## Isolated native client

Use process overrides rather than changing an existing production MCP connection
or assuming a named profile isolates credentials. The tested alias is
`polynet_2b2_staging`; it is intentionally separate from normal `polynet` setup.

```sh
codex app-server --stdio \
  -c 'mcp_servers.node_repl.enabled=false' \
  -c 'mcp_servers.polynet_2b2_staging.url="https://polynet-staging.vercel.app/runtime/mcp"' \
  -c 'mcp_oauth_credentials_store="keyring"' \
  -c 'features.apps=false' \
  -c 'analytics.enabled=false'
```

Initialize the app-server with `capabilities.experimentalApi: true` and send
`initialized`. Verify effective configuration before enrollment. Use native
`mcpServer/oauth/login` with the test alias, registration `auto`, and scopes
`openid`, `profile`, `email`, `offline_access`. Open its returned authorization
URL in a dedicated staging browser tab and use an existing staging identity.
Record the native completion notification. Do not persist authorization codes,
state, PKCE material, cookies, access tokens or refresh tokens in receipts.

The app-server exposes native `thread/start`, `mcpServerStatus/list` and
`mcpServer/tool/call`; direct RPC calls exercise the native transport without an
inference turn. Use ephemeral conversations and invoke only `polynet_list`,
`polynet_read` and `polynet_search`. Do not invoke `turn/start`, `polynet_write`
or `polynet_call`.

## Acceptance sequence

1. Record main, clean source head, served staging SHA/backend and production
   identity read-only. Inspect protected-resource and issuer discovery.
2. Complete native OAuth. Verify configured resource, issuer and registration
   method; metadata support alone is not enrollment evidence.
3. Read `/users/me/profile.md`, require the expected canonical identity
   fingerprint, and read `/communities/<existing-authorized-slug>/members/me/context.md`.
   Require its user identity to match and read an existing synthetic canary.
4. Corroborate that a denial control actually exists without caller ownership or
   active membership, then require its community self-context to fail closed.
   Read-only administrative metadata may corroborate fixtures; it must not
   acquire credentials or replace native authenticated calls.
5. Start a fresh ephemeral conversation and repeat identity/canary reads without
   login. Fully terminate the test native process, launch it again with the same
   overrides, corroborate different process IDs and repeat those reads.
6. Allow normal expiry and require native refresh plus authenticated reads
   without login. Prefer non-secret native refresh lifecycle traces. Distinguish
   directly observed expiry timestamps from inference using native refresh
   reason, credential-record modification times and later successful reads.
   Never weaken Keychain controls to obtain evidence.
7. Terminate test clients, run native `codex mcp logout polynet_2b2_staging` with
   the same endpoint/store overrides, then verify a fresh process cannot read
   protected context and the test credential record is absent. Verify the user's
   configuration file hash is unchanged. This is local disconnect, not upstream
   grant revocation or rejection of already-issued JWTs.

Record native client version, selected identity fingerprint, exact resource and
fixture paths, observations/times, process IDs, refresh evidence, local cleanup
and limitations. Preserve memberships and the earlier revoked 2A fixture.
Canonical `authSessions` row changes do not prove external OAuth continuity.

If a gate fails, stop dependent acceptance, identify the failing boundary, and
fix only that demonstrated seam. Runtime changes require appropriate focused
checks and the canonical gate before an explicit staging release. A receipt-only
change does not require redeploying the already validated runtime.

Production, provider-wide revocation, Claude Code compatibility, founder writes,
billing and inference remain outside this slice. The next product proof is an
independent founder client contribution/retry path.
