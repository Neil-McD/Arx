# Polynet Web

This is the canonical Polynet web app and primary release surface.

## Local dev

1. Install deps:
   - `cd apps/web`
   - `npm install`
2. Set env in repo root `.env`:
   - `VITE_CONVEX_URL`
   - optional `VITE_CONVEX_PUBLIC_KEY`
   - `ARX_AUTH_AUTHORIZE_URL`
   - `ARX_AUTH_TOKEN_URL`
   - `ARX_AUTH_CLIENT_ID`
   - `ARX_AUTH_BRIDGE_SECRET`
   - `ARX_AUTH_JWT_ISSUER`
   - `ARX_AUTH_JWT_JWKS_URL`
   - Validate config: `npm run check:auth-runtime-readiness`
3. Run:
   - `npm run dev`
4. Cloud Auth:
   - Add `http://localhost:5174/api/auth/google/callback` to the OAuth redirect allowlist.

## Vercel deploy

Create a Vercel project for this repo with:

- **Root Directory:** `.`
- **Build Command:** `npm run build`
- **Output Directory:** `apps/web/dist`

Set the following Vercel env vars:

- `VITE_CONVEX_URL`
- optional `VITE_CONVEX_PUBLIC_KEY`
- `ARX_AUTH_AUTHORIZE_URL`
- `ARX_AUTH_TOKEN_URL`
- `ARX_AUTH_CLIENT_ID`
- `ARX_AUTH_BRIDGE_SECRET`
- optional `ARX_AUTH_SESSION_COOKIE_DOMAIN`
- optional `ARX_AUTH_SESSION_COOKIE_MAX_AGE_SECONDS`
- `ARX_AUTH_JWT_ISSUER`
- `ARX_AUTH_JWT_JWKS_URL`

Production auth posture:

- Browser sign-in/session continuity runs through root `/api/auth/*`.
- `ARX_AUTH_*` metadata and JWT verifier vars point at your AuthKit / OIDC issuer domain.
- The browser bundle no longer needs direct WorkOS SDK env.

Workspace preview / live desktop depend on the preview proxy signing secret:

- Set `ARX_PREVIEW_PROXY_SIGNING_SECRET` to the same value in both Convex/runtime and the main `polynet` deployment.
- `VITE_DAYTONA_PREVIEW_ORIGIN` should point at the dedicated preview proxy origin for production preview transport.
- `VITE_DAYTONA_LIVE_DESKTOP_PROXY_ORIGIN` should point at the WS-capable live desktop proxy when computer-use live desktop is enabled.

Cloud Auth redirect allowlist:

- Add your Vercel Production domain callback, for example `https://www.polynet.ai/api/auth/google/callback`
- Add Preview callback domains if you want OAuth to work on previews

## Current scope

- Cloud-only agent threads/messages
- Community memberships rail + discover grid
- Community chat/resources/members/settings/analytics on the web surface
