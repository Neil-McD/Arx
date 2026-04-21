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
3. Shared OAuth metadata for hosted MCP auth discovery and server-side PKCE exchange:
   - `ARX_AUTH_AUTHORIZE_URL`
   - `ARX_AUTH_TOKEN_URL`

Optional:

1. `ARX_AUTH_JWT_AUDIENCE=<AuthKit client id>`
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

There are still two WorkOS domain concepts:

1. `AUTHKIT_DOMAIN`
   - used for hosted AuthKit UI, OIDC issuer, JWKS, and OAuth metadata
   - examples: `<slug>.authkit.app` or an owned AuthKit domain
2. `AUTH_API_DOMAIN`
   - optional future hardening path for direct browser AuthKit
   - not required for the current same-origin bridge architecture

Given `AUTHKIT_DOMAIN`:

1. `ARX_AUTH_CLIENT_ID=<AuthKit client id>`
2. `ARX_AUTH_JWT_ISSUER=https://<AUTHKIT_DOMAIN>`
3. `ARX_AUTH_JWT_JWKS_URL=https://<AUTHKIT_DOMAIN>/oauth2/jwks`
4. `ARX_AUTH_AUTHORIZE_URL=https://<AUTHKIT_DOMAIN>/oauth2/authorize`
5. `ARX_AUTH_TOKEN_URL=https://<AUTHKIT_DOMAIN>/oauth2/token`
6. `ARX_AUTH_BRIDGE_SECRET=<opaque bridge signing secret>`

## 4) Redirect URI

The hosted WorkOS flow should redirect back to the same-origin callback route.

Examples:

1. Local: `http://localhost:5174/api/auth/google/callback`
2. Production: `https://www.polynet.ai/api/auth/google/callback`

## 5) Local Validation

Run:

```bash
npm run check:auth-runtime-readiness
```

This check now catches:

1. missing `ARX_AUTH_BRIDGE_SECRET`
2. missing OAuth metadata required by the same-origin bridge
3. missing JWT verifier configuration
4. fail-open verified-identity posture

## 6) Continuity Validation

After the env posture is aligned, verify the actual failure seam:

1. sign in on desktop
2. refresh the app
3. close and reopen the desktop app
4. leave the session idle past access-token expiry
5. confirm bootstrap recovers without a manual sign-in click
