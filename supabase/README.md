# Supabase workflow (keep schema reproducible)

Arx treats **the repo as the source of truth** for the cloud schema and Edge Functions.

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
