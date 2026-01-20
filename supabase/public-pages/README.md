# Public Pages (Vercel)

This directory contains static web pages intended to be hosted on Vercel.

## Deploy

Create a Vercel project with the repository root directory set to `supabase/public-pages` and deploy.

The public URL should look like:

`https://<your-project>.vercel.app/join.html`

## Edge Function redirect

The Supabase Edge Function at `/c/...` redirects to the join page using:

- `ARX_JOIN_PAGE_URL` env var (preferred), or
- a code fallback URL in `supabase/functions/c/index.ts`
