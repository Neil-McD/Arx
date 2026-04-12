# Polynet Web

This is the canonical Polynet web app and primary release surface.

## Local dev

1. Install deps (requires network access):
   - `cd apps/web`
   - `npm install`
2. Set env:
   - Copy repo root `.env.example` → `.env`
   - Fill `VITE_CONVEX_URL`
   - `VITE_CONVEX_PUBLIC_KEY` is optional
   - Set OAuth/OIDC vars (`ARX_AUTH_AUTHORIZE_URL`, `ARX_AUTH_TOKEN_URL`, `ARX_AUTH_CLIENT_ID`) for sign-in
   - Set JWT verifier vars (`ARX_AUTH_JWT_ISSUER`, `ARX_AUTH_JWT_JWKS_URL`) for verified Convex identity
   - Set `ARX_AUTH_BRIDGE_SECRET` for the auth continuity bridge
   - Optionally set `ARX_AUTH_SESSION_COOKIE_DOMAIN=.polynet.ai` for cross-subdomain continuity
    - Validate config: `npm run check:auth-runtime-readiness`
3. Run:
   - `npm run dev`
4. Cloud Auth:
   - Add `http://localhost:5174` to the Cloud Auth redirect allowlist.

## Vercel deploy

Create a Vercel project for this repo with:

- **Root Directory:** `apps/web`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

Set the following Vercel env vars:

- `VITE_CONVEX_URL`
- `VITE_CONVEX_PUBLIC_KEY` (optional)
- `ARX_AUTH_AUTHORIZE_URL`
- `ARX_AUTH_TOKEN_URL`
- `ARX_AUTH_CLIENT_ID`
- `ARX_AUTH_JWT_ISSUER`
- `ARX_AUTH_JWT_JWKS_URL`
- `ARX_AUTH_BRIDGE_SECRET`
- `ARX_AUTH_SESSION_COOKIE_DOMAIN` (recommended for `*.polynet.ai`)

Workspace preview / live desktop depend on the preview proxy signing secret:

- Set `ARX_PREVIEW_PROXY_SIGNING_SECRET` to the same value in both Convex/runtime and the main `polynet` deployment.
- `VITE_DAYTONA_PREVIEW_ORIGIN` should point at the dedicated preview proxy origin for production preview transport.
- `VITE_DAYTONA_LIVE_DESKTOP_PROXY_ORIGIN` should point at the WS-capable live desktop proxy when computer-use live desktop is enabled.

Cloud Auth redirect allowlist:

- Add your Vercel Production domain (e.g. `https://<project>.vercel.app`)
- Add Preview domains if you want OAuth to work on previews
  - or set `ARX_AUTH_REDIRECT_URI` if you want the provider to redirect directly to a bridge callback URL

## Current scope

- Cloud-only agent threads/messages
- Community memberships rail + discover grid
- Community chat/resources/members/settings/analytics on the web surface
