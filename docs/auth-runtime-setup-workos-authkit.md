# Auth Setup (Web + Convex + WorkOS AuthKit)

Status: active operational guide  
Worktree: `/Users/neilmcdevitt/code/arx`

## 1) Irreducible Inputs

The direct WorkOS posture has three layers:

1. Browser sign-in and session continuity:
   - `VITE_WORKOS_CLIENT_ID`
   - `VITE_WORKOS_REDIRECT_URI`
   - optional `VITE_WORKOS_API_HOSTNAME`
   - `VITE_WORKOS_DEV_MODE`
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

There are two valid production browser postures:

1. Fallback posture:
   - leave `VITE_WORKOS_API_HOSTNAME` unset
   - set `VITE_WORKOS_DEV_MODE=true`
   - this keeps refresh continuity browser-owned
2. Hardened posture:
   - configure a custom Authentication API domain you control
   - set `VITE_WORKOS_API_HOSTNAME=<that Authentication API domain>`
   - set `VITE_WORKOS_DEV_MODE=false`

The fallback posture is weaker, but it is the correct configuration until a real Authentication API domain exists.

## 3) WorkOS AuthKit Mapping

There are two different WorkOS domain concepts:

1. `AUTHKIT_DOMAIN`
   - used for hosted AuthKit UI, OIDC issuer, JWKS, and OAuth metadata
   - examples: `<slug>.authkit.app` or an owned AuthKit domain
2. `AUTH_API_DOMAIN`
   - used only for browser `VITE_WORKOS_API_HOSTNAME`
   - must be a custom Authentication API domain
   - must not point at `*.authkit.app`

Given `AUTHKIT_DOMAIN` and optional `AUTH_API_DOMAIN`:

1. `VITE_WORKOS_CLIENT_ID=<AuthKit client id>`
2. `VITE_WORKOS_REDIRECT_URI=https://<your-web-origin>/workspace`
3. if `AUTH_API_DOMAIN` exists:
   - `VITE_WORKOS_API_HOSTNAME=<AUTH_API_DOMAIN>`
   - `VITE_WORKOS_DEV_MODE=false`
4. if `AUTH_API_DOMAIN` does not exist:
   - leave `VITE_WORKOS_API_HOSTNAME` unset
   - set `VITE_WORKOS_DEV_MODE=true`
5. `ARX_AUTH_CLIENT_ID=<AuthKit client id>`
6. `ARX_AUTH_JWT_ISSUER=https://<AUTHKIT_DOMAIN>`
7. `ARX_AUTH_JWT_JWKS_URL=https://<AUTHKIT_DOMAIN>/oauth2/jwks`
8. `ARX_AUTH_AUTHORIZE_URL=https://<AUTHKIT_DOMAIN>/oauth2/authorize`
9. `ARX_AUTH_TOKEN_URL=https://<AUTHKIT_DOMAIN>/oauth2/token`

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

This check now catches:

1. `VITE_WORKOS_API_HOSTNAME` pointing at an `*.authkit.app` hosted UI domain
2. mixed browser posture (`VITE_WORKOS_API_HOSTNAME` set with `VITE_WORKOS_DEV_MODE=true`)
3. fallback browser posture on a non-local redirect URI
4. missing fallback when no Authentication API domain is configured

## 6) Continuity Validation

After the env posture is aligned, verify the actual failure seam:

1. sign in on desktop
2. refresh the app
3. close and reopen the desktop app
4. leave the session idle past access-token expiry
5. confirm bootstrap recovers without a manual sign-in click
