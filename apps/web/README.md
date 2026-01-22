# Arx Web (Browser UI)

This is the browser version of Arx. It intentionally **reuses the desktop UI styling** by importing `src/index.css` from repo root, so the web UI matches the desktop look/layout.

## Local dev

1. Install deps (requires network access):
   - `cd apps/web`
   - `npm install`
2. Set env:
   - Copy `apps/web/.env.example` → `apps/web/.env.local`
   - Fill `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
3. Run:
   - `npm run dev`
4. Supabase Auth:
   - Add `http://localhost:5174` to the Supabase Auth redirect allowlist.

## Vercel deploy

Create a Vercel project for this repo with:

- **Root Directory:** `apps/web`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

Set the following Vercel env vars:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Supabase Auth redirect allowlist:

- Add your Vercel Production domain (e.g. `https://<project>.vercel.app`)
- Add Preview domains if you want OAuth to work on previews
  - or leave `VITE_SUPABASE_REDIRECT_URL` unset so it uses `window.location.origin`

## Current scope

- Cloud-only agent threads/messages (no Tauri/local tools)
- Community memberships rail + discover grid
- Community chat/resources/members are planned next (desktop remains the power surface).

