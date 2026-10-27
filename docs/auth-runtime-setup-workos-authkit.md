# Auth Setup (Web + Convex + Same-Origin WorkOS Bridge)

Status: active operational guide  
Worktree: `/Users/neilmcdevitt/code/arx`

## 1) Irreducible Inputs

The current desktop auth posture has three layers:

1. Same-origin browser auth bridge:
   - root `/api/auth/*`
   - `ARX_AUTH_BRIDGE_SECRET`
   - optional `ARX_AUTH_SESSION_COOKIE_DOMAIN`
2. Convex verified identity:
   - `ARX_AUTH_CLIENT_ID`
   - `ARX_AUTH_JWT_ISSUER`
   - `ARX_AUTH_JWT_JWKS_URL`
3. Shared OAuth metadata for hosted MCP auth discovery and server-side Google PKCE exchange:
   - `ARX_AUTH_AUTHORIZE_URL`
   - `ARX_AUTH_TOKEN_URL`

Required before hosted MCP auth cutover:

1. `ARX_AUTH_JWT_AUDIENCE=<AuthKit client id or primary JWT audience>`
2. `ARX_MCP_RESOURCE_URL=<canonical MCP resource URL, including /runtime/mcp>`
3. `ARX_MCP_AUTH_JWT_AUDIENCE=<canonical MCP resource URL, including /runtime/mcp>`

Optional:

1. `ARX_AUTH_REGISTRATION_URL=<verified OAuth dynamic registration endpoint>`
2. `ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT=false`
3. `ARX_AUTH_SESSION_COOKIE_MAX_AGE_SECONDS=<seconds>`

## 2) Production Posture

Desktop auth is now:

1. browser -> same-origin `/api/auth/google/start`
2. callback -> same-origin `/api/auth/google/callback`
3. opaque session cookie -> `/api/auth/session` and `/api/auth/refresh`
4. Convex still verifies the upstream JWT family directly

This removes browser-owned refresh-token continuity from the desktop path.

## 3) WorkOS AuthKit Mapping

Given `AUTHKIT_DOMAIN`:

1. `ARX_AUTH_CLIENT_ID=<AuthKit client id>`
2. `ARX_AUTH_JWT_ISSUER=https://<AUTHKIT_DOMAIN>`
3. `ARX_AUTH_JWT_JWKS_URL=https://<AUTHKIT_DOMAIN>/oauth2/jwks`
4. `ARX_AUTH_AUTHORIZE_URL=https://<AUTHKIT_DOMAIN>/oauth2/authorize`
5. `ARX_AUTH_TOKEN_URL=https://<AUTHKIT_DOMAIN>/oauth2/token`
6. `ARX_AUTH_BRIDGE_SECRET=<opaque bridge signing secret>`

For hosted MCP auth, configure the WorkOS/AuthKit Resource Indicator to the same canonical value returned by `/.well-known/oauth-protected-resource`:

```text
https://<POLYNET_ORIGIN>/runtime/mcp
```

Set `ARX_MCP_RESOURCE_URL` to that exact value in production so OAuth protected-resource metadata does not drift when requests pass through Vercel, Convex, or another proxy origin. Set `ARX_MCP_AUTH_JWT_AUDIENCE` to the same value when MCP access tokens carry the resource URL as their `aud` claim. Keep `ARX_AUTH_JWT_AUDIENCE` for the primary web/session JWT audience if it differs.

Only set `ARX_AUTH_REGISTRATION_URL` when the upstream issuer has a verified dynamic registration endpoint. Polynet must not infer one from the token endpoint.

## 4) Hosted MCP OAuth Continuity

The hosted Polynet MCP continuity invariant is:

```text
one harness profile + one Polynet MCP config + one successful OAuth login
= durable access across new chats, harness restarts, and normal access-token expiry
```

Polynet is the OAuth resource server. WorkOS/AuthKit is the authorization server. The external harness is the OAuth client and owns local credential persistence. Polynet must not ask users to paste bearer tokens for normal MCP setup.

WorkOS/AuthKit must offer a registration method supported by the selected client
and issue refresh-capable credentials:

1. prefer Client ID Metadata Documents (CIMD) when advertised by the issuer;
   Dynamic Client Registration (DCR) or a pre-registered client are alternatives,
2. enable DCR only when a required client needs it; both methods are not a
   prerequisite for proving one native client,
3. include `refresh_token` in authorization-server `grant_types_supported`,
4. include `offline_access` in authorization-server `scopes_supported`,
5. keep the MCP Resource Indicator equal to `https://<POLYNET_ORIGIN>/runtime/mcp`.

Recommended Codex credential persistence should be configured before OAuth when available:

```toml
mcp_oauth_credentials_store = "keyring"
```

Codex discovers the authorization server from Polynet's protected-resource
metadata. Check the advertised issuer's own discovery document when assessing
registration support. Polynet's metadata mirror is not evidence that a provider
capability is absent. Never advertise an unverified registration endpoint.

Codex native Streamable HTTP OAuth is the canonical setup path. Run `add` first:

```bash
codex mcp add polynet --url https://<POLYNET_ORIGIN>/runtime/mcp
```

Only if Codex does not open OAuth during `add`, run the login fallback:

```bash
codex mcp login polynet --scopes openid,profile,email,offline_access
```

New harness setup should use `polynet` as the local server alias. Existing harnesses that already have `polymcp` configured may keep using it as the same Polynet MCP server; do not install both aliases unless intentionally migrating the local alias.

`mcp-remote` may remain useful for legacy clients, but it is not proof that native Codex MCP OAuth is authenticated. A native Codex harness and an `mcp-remote` adapter can use different client registrations and credential stores.

Re-authentication should be treated as a bug unless one of these is true:

1. the user is using a new harness profile or device,
2. the user explicitly logged out,
3. the user switched accounts,
4. the authorization grant or refresh token was revoked,
5. the refresh token expired,
6. local credential storage was cleared or unavailable.

Continuity validation:

1. isolate the staging endpoint and local alias without changing existing
   production connections; a named conversation/profile alone does not prove
   MCP configuration or credential-store isolation,
2. add Polynet with native Streamable HTTP,
3. complete OAuth during `codex mcp add`, or run the login fallback if `add` did not open OAuth,
4. discover tools, then require an authenticated `/users/me/profile.md` read,
   identity-bound community self-context and a known authorized resource read;
   tool listing alone is not an authentication proof,
5. close and reopen Codex,
6. repeat authenticated reads for the same canonical user without a browser
   login; separately exercise a fresh conversation,
7. wait past normal access-token expiry,
8. verify native refresh and authenticated reads without a browser login,
9. confirm a real inaccessible community fails closed, then disconnect only
   the test connection and verify a fresh process cannot read protected data.

Do not extract a bearer to drive a second client and call that native continuity.
Use the native client's own transport and credential store. Record direct expiry
observations separately from lifecycle-trace inferences. Local credential removal
does not certify upstream grant revocation, rejection of already-issued JWTs,
or logout of other clients. Web-session logout is a separate lifecycle.

For a staging-only execution and receipt, see
[slice 2B2](archive/polynet-staging-external-oauth-2b2.md).

## 5) Redirect URI

The hosted WorkOS Google flow should redirect back to the same-origin callback route.

Examples:

1. Local: `http://localhost:5174/api/auth/google/callback`
2. Production: `https://www.polynet.ai/api/auth/google/callback`

## 6) Local Validation

Run:

```bash
npm run ops:auth-runtime-readiness
```

This check now catches:

1. missing `ARX_AUTH_BRIDGE_SECRET`
2. missing OAuth metadata required by the same-origin bridge
3. missing JWT verifier configuration
4. fail-open verified-identity posture

## 7) Web Session Continuity Validation

After the env posture is aligned, verify the actual failure seam:

1. sign in on desktop
2. refresh the app
3. close and reopen the desktop app
4. leave the session idle past access-token expiry
5. confirm bootstrap recovers without a manual sign-in click

## 8) Session Maintenance

Revoked rotated session rows are safe to prune after a retention window.

Audit (no deletion):

```bash
npm run auth:prune-sessions -- --older-than-days 14 --limit 500
```

The maintenance script targets production and defaults to audit-only. Deletion
requires `--execute` and removes only eligible revoked rows in bounded batches.
It is not a staging validation command. See the script's `--help` for its bounds.
