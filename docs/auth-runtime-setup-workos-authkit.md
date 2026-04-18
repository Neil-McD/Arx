# Auth Setup (Web + Convex + WorkOS AuthKit)

Status: active operational guide  
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`

## 1) Irreducible Inputs

The current auth model has three layers:

1. Browser sign-in:
   - `VITE_WORKOS_CLIENT_ID`
   - `VITE_WORKOS_REDIRECT_URI`
   - `VITE_WORKOS_DEV_MODE` unless you have a custom WorkOS auth API hostname
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

## 2) WorkOS AuthKit Mapping

Given `AUTHKIT_DOMAIN` (for example `auth.example.com` or `<slug>.authkit.app`):

1. `VITE_WORKOS_CLIENT_ID=<AuthKit client id>`
2. `VITE_WORKOS_REDIRECT_URI=https://<your-web-origin>/workspace`
3. `ARX_AUTH_CLIENT_ID=<AuthKit client id>`
4. `ARX_AUTH_JWT_ISSUER=https://<AUTHKIT_DOMAIN>`
5. `ARX_AUTH_JWT_JWKS_URL=https://<AUTHKIT_DOMAIN>/oauth2/jwks`
6. `ARX_AUTH_AUTHORIZE_URL=https://<AUTHKIT_DOMAIN>/oauth2/authorize`
7. `ARX_AUTH_TOKEN_URL=https://<AUTHKIT_DOMAIN>/oauth2/token`

## 3) Redirect URI

The hosted WorkOS flow should redirect back to the app itself.

Examples:

1. Local: `http://localhost:5174/workspace`
2. Production: `https://www.polynet.ai/workspace`

## 4) Local Validation

Run:

```bash
npm run check:auth-runtime-readiness
```

The check fails if required values are missing or if unverified-subject fallback is enabled.
