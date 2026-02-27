# Supabase workflow (keep schema reproducible)

PolyNet treats **the repo as the source of truth** for the cloud schema and Edge Functions.

## Migrations

- All schema changes live in `supabase/migrations/`.
- Prefer migration filenames in the format: `YYYYMMDDHHMMSS_description.sql` (14-digit timestamp).
  - This matches Supabase’s `schema_migrations.version` values and avoids “repo filename vs applied version” drift.
- Don’t apply ad-hoc SQL in the Supabase dashboard without also creating a matching migration file in the repo.

### Drift checks

- Compare the repo migration list (`ls supabase/migrations`) against Supabase’s migration history.
- If a migration was applied but the file isn’t in git, add it **with the exact applied version** in the filename.

## Edge Functions

- Edge functions live in `supabase/functions/<slug>/`.
- Any deployed function must exist in git (avoid “deployed but untracked” drift).
- Shared helpers belong in `supabase/functions/_shared/`.

## Secrets (Edge Functions)

Edge Functions run on Supabase and read secrets from the Supabase project (not your local `.env`).

- Copy `supabase/.secrets.example.env` → `supabase/.secrets.env`
- Paste keys into `supabase/.secrets.env`
- Apply:
  - `supabase secrets set --project-ref <PROJECT_REF> --env-file supabase/.secrets.env`

Minimum for runtime lanes:
- `public_turn`: `OPENROUTER_API_KEY` (or model provider key via current function config)
- `platform_agent_infer`: provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`) as needed by selected model routing
- `runtime_turn` paid Daytona lane: `DAYTONA_API_URL`, `DAYTONA_API_KEY`
  - optional:
    - `DAYTONA_ORG_ID`, `DAYTONA_TARGET`, `DAYTONA_SNAPSHOT`
    - `DAYTONA_AUTO_STOP_INTERVAL_MINUTES` (default `20`)
    - `DAYTONA_AUTO_ARCHIVE_INTERVAL_MINUTES` (default `0`)
    - `DAYTONA_AUTO_DELETE_INTERVAL_MINUTES` (default `-1`)
