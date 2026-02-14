# Release DB Key Provisioning (`ARX_DB_KEY`)

## Contract
- Debug builds may use fallback key: `dev-only-key`.
- Non-debug/release builds require `ARX_DB_KEY` to be set to a non-empty value.
- If the key is missing in release mode, app startup fails closed.

Implementation references:
- `src-tauri/src/db.rs`
- `src-tauri/src/main.rs`

## Why this exists
- Local SQLite uses SQLCipher (`bundled-sqlcipher`).
- The DB key must be explicit in release to prevent silent insecure defaults.

## Provisioning checklist (release)
1. Generate a strong random key and store it in your secret manager.
2. Inject `ARX_DB_KEY` into the runtime environment for the desktop process.
3. Validate startup in a release-profile smoke run before distribution.

Example (local release smoke):
```bash
export ARX_DB_KEY="$(openssl rand -hex 32)"
npm run tauri build
```

## Key mismatch behavior
- If an existing local DB was encrypted with a different key, startup fails with a key-mismatch style error.
- The app does not silently fall back to a fresh DB for this case.

Operator action:
1. Re-provide the original `ARX_DB_KEY`, or
2. Restore a DB backup encrypted with the same key.

## CI guard
- Scripts:
  - `scripts/release_startup_smoke_check.sh`
  - `scripts/release_startup_missing_key_check.sh`
  - `scripts/release_db_key_contract_check.sh`
- Workflow: `.github/workflows/mvp-guards.yml`
