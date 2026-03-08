# Polynet Web

This is the canonical Polynet web app. It currently shares some shell styling with the legacy root `src` components while the web surface is being fully normalized.

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
   - Recommended default: `VITE_ENABLE_RUNTIME_TURN_V2=true`
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
- `VITE_ENABLE_RUNTIME_TURN_V2=true`

Cloud Auth redirect allowlist:

- Add your Vercel Production domain (e.g. `https://<project>.vercel.app`)
- Add Preview domains if you want OAuth to work on previews
  - or leave `VITE_AUTH_REDIRECT_URL` unset so it uses `window.location.origin`

## Current scope

- Cloud-only agent threads/messages
- Community memberships rail + discover grid
- Community chat/resources/members/settings/analytics on the web surface
