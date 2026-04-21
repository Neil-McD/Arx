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
   - Set WorkOS browser vars:
     - `VITE_WORKOS_CLIENT_ID`
     - `VITE_WORKOS_REDIRECT_URI`
     - fallback posture: leave `VITE_WORKOS_API_HOSTNAME` unset and use `VITE_WORKOS_DEV_MODE=true`
     - hardened posture: set `VITE_WORKOS_API_HOSTNAME=<your Authentication API domain>` and `VITE_WORKOS_DEV_MODE=false`
   - Set shared OAuth/OIDC metadata vars (`ARX_AUTH_AUTHORIZE_URL`, `ARX_AUTH_TOKEN_URL`, `ARX_AUTH_CLIENT_ID`) for Convex MCP auth discovery. These point at your AuthKit / OIDC issuer domain.
   - Set JWT verifier vars (`ARX_AUTH_JWT_ISSUER`, `ARX_AUTH_JWT_JWKS_URL`) for verified Convex identity. These also point at your AuthKit / OIDC issuer domain.
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
- `VITE_WORKOS_CLIENT_ID`
- `VITE_WORKOS_REDIRECT_URI`
- `VITE_WORKOS_DEV_MODE`
- `ARX_AUTH_AUTHORIZE_URL`
- `ARX_AUTH_TOKEN_URL`
- `ARX_AUTH_CLIENT_ID`
- `ARX_AUTH_JWT_ISSUER`
- `ARX_AUTH_JWT_JWKS_URL`

Production auth posture:

- Working fallback posture:
  - leave `VITE_WORKOS_API_HOSTNAME` unset
  - set `VITE_WORKOS_DEV_MODE=true`
- Hardened browser posture:
  - set `VITE_WORKOS_API_HOSTNAME` to a custom Authentication API domain you control
  - set `VITE_WORKOS_DEV_MODE=false`
- Do not point `VITE_WORKOS_API_HOSTNAME` at an `*.authkit.app` hosted AuthKit UI domain.
- `ARX_AUTH_*` metadata and JWT verifier vars may still point at your AuthKit / OIDC issuer domain.

Workspace preview / live desktop depend on the preview proxy signing secret:

- Set `ARX_PREVIEW_PROXY_SIGNING_SECRET` to the same value in both Convex/runtime and the main `polynet` deployment.
- `VITE_DAYTONA_PREVIEW_ORIGIN` should point at the dedicated preview proxy origin for production preview transport.
- `VITE_DAYTONA_LIVE_DESKTOP_PROXY_ORIGIN` should point at the WS-capable live desktop proxy when computer-use live desktop is enabled.

Cloud Auth redirect allowlist:

- Add your Vercel Production domain (e.g. `https://<project>.vercel.app`)
- Add Preview domains if you want OAuth to work on previews

## Current scope

- Cloud-only agent threads/messages
- Community memberships rail + discover grid
- Community chat/resources/members/settings/analytics on the web surface
