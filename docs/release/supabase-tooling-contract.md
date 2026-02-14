# Supabase Tooling Contract (MVP)

Date: 2026-02-12  
Scope: `.worktrees/mvp`

## Pinned CLI Line

- Required Supabase CLI prefix: `2.51.x`
- Enforcement script: `scripts/supabase_cli_contract_check.sh`
- Override (intentional bump only): set `SUPABASE_CLI_REQUIRED_PREFIX` in CI/local and update this doc in the same change.

## Migration Filename Contract

- Location: `supabase/migrations`
- Required filename pattern: `YYYYMMDDHHMMSS_description.sql`
- Timestamp prefix must be unique and monotonic.
- Enforcement script: `scripts/supabase_migration_filename_guard.sh`

## Why This Exists

- Prevent local/CI drift from implicit CLI upgrades.
- Keep migration history deterministic and easy to audit.
- Fail fast when tooling assumptions no longer match the checked-in contract.

## Validation Commands

```bash
bash scripts/supabase_cli_contract_check.sh
bash scripts/supabase_migration_filename_guard.sh
```

Both checks are also wired into `scripts/harness_failure_matrix_check.sh`.
