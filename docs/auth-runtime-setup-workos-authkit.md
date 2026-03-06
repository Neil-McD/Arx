# Auth Runtime Setup (Convex + WorkOS AuthKit)

Status: active operational guide  
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`

## 1) Irreducible Inputs

The runtime auth path requires exactly these values:

1. `VITE_CONVEX_URL`
2. `ARX_AUTH_AUTHORIZE_URL`
3. `ARX_AUTH_TOKEN_URL`
4. `ARX_AUTH_CLIENT_ID`
5. `ARX_AUTH_JWT_ISSUER`
6. `ARX_AUTH_JWT_JWKS_URL`

Without these, sign-in cannot complete.

## 2) WorkOS AuthKit Mapping

Given `AUTHKIT_DOMAIN` (for example `auth.example.com` or `<slug>.authkit.app`):

1. `ARX_AUTH_AUTHORIZE_URL=https://<AUTHKIT_DOMAIN>/oauth2/authorize`
2. `ARX_AUTH_TOKEN_URL=https://<AUTHKIT_DOMAIN>/oauth2/token`
3. `ARX_AUTH_CLIENT_ID=<AuthKit client id>`
4. `ARX_AUTH_JWT_ISSUER=https://<AUTHKIT_DOMAIN>`
5. `ARX_AUTH_JWT_JWKS_URL=https://<AUTHKIT_DOMAIN>/oauth2/jwks`

Recommended:

1. `ARX_AUTH_JWT_AUDIENCE=<AuthKit client id>`
2. `VITE_AUTH_JWT_ISSUER=https://<AUTHKIT_DOMAIN>`
3. `ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT=false`

## 3) Redirect URI

This app defaults OAuth redirect to `window.location.origin` when `VITE_AUTH_REDIRECT_URL` is unset.

Local examples:

1. Web: `http://localhost:5174`
2. Desktop dev (Vite shell): `http://localhost:5273`

If you set `VITE_AUTH_REDIRECT_URL`, add that exact value to your AuthKit allowed callback URLs.

## 4) Local Validation

Run:

```bash
npm run check:auth-runtime-readiness
```

The check fails if required values are missing or if unverified-subject fallback is enabled.
