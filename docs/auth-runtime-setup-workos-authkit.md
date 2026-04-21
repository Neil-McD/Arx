# Auth Setup (Web + Convex + WorkOS AuthKit)

Status: active operational guide  
Worktree: `/Users/neilmcdevitt/code/arx`

## 1) Irreducible Inputs

The direct WorkOS posture has three layers:

1. Browser sign-in and session continuity:
   - `VITE_WORKOS_CLIENT_ID`
   - `VITE_WORKOS_REDIRECT_URI`
   - `VITE_WORKOS_API_HOSTNAME`
   - local-only fallback: `VITE_WORKOS_DEV_MODE=true`
2. Convex verified identity:
   - `ARX_AUTH_CLIENT_ID`
   - `ARX_AUTH_JWT_ISSUER`
   - `ARX_AUTH_JWT_JWKS_URL`
3. Shared OAuth metadata for hosted MCP auth discovery:
   - `ARX_AUTH_AUTHORIZE_URL`
   - `ARX_AUTH_TOKEN_URL`

Optional:

1. `ARX_AUTH_JWT_AUDIENCE=<AuthKit client id>`
2. `ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT=false`

## 2) Production Posture

Production should use:

1. an AuthKit domain you control, for example `auth.polynet.ai`
2. `VITE_WORKOS_API_HOSTNAME=<that domain>`
3. `VITE_WORKOS_DEV_MODE=false`

Do not treat `VITE_WORKOS_DEV_MODE=true` as the normal production answer.
That posture keeps refresh continuity browser-owned.

## 3) WorkOS AuthKit Mapping

Given `AUTHKIT_DOMAIN` (for example `auth.polynet.ai` or `<slug>.authkit.app`):

1. `VITE_WORKOS_CLIENT_ID=<AuthKit client id>`
2. `VITE_WORKOS_API_HOSTNAME=<AUTHKIT_DOMAIN>`
3. `VITE_WORKOS_REDIRECT_URI=https://<your-web-origin>/workspace`
4. `ARX_AUTH_CLIENT_ID=<AuthKit client id>`
5. `ARX_AUTH_JWT_ISSUER=https://<AUTHKIT_DOMAIN>`
6. `ARX_AUTH_JWT_JWKS_URL=https://<AUTHKIT_DOMAIN>/oauth2/jwks`
7. `ARX_AUTH_AUTHORIZE_URL=https://<AUTHKIT_DOMAIN>/oauth2/authorize`
8. `ARX_AUTH_TOKEN_URL=https://<AUTHKIT_DOMAIN>/oauth2/token`

If you are temporarily testing without an owned AuthKit domain:

1. leave `VITE_WORKOS_API_HOSTNAME` unset or point it at the temporary AuthKit domain
2. use `VITE_WORKOS_DEV_MODE=true` locally only

## 4) Redirect URI

The hosted WorkOS flow should redirect back to the app itself.

Examples:

1. Local: `http://localhost:5174/workspace`
2. Production: `https://www.polynet.ai/workspace`

## 5) Local Validation

Run:

```bash
npm run check:auth-runtime-readiness
```

This check now warns when:

1. a non-local redirect URI is missing `VITE_WORKOS_API_HOSTNAME`
2. `VITE_WORKOS_DEV_MODE=true` is being used for a non-local redirect URI
3. `VITE_WORKOS_API_HOSTNAME` and `VITE_WORKOS_DEV_MODE=true` are both set

## 6) Continuity Validation

After the env posture is aligned, verify the actual failure seam:

1. sign in on desktop
2. refresh the app
3. close and reopen the desktop app
4. leave the session idle past access-token expiry
5. confirm bootstrap recovers without a manual sign-in click
