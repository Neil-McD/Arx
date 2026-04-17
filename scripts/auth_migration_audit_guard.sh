#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIT_FILE="$ROOT/convex/authMigrationAudit.ts"
SCRIPT_FILE="$ROOT/scripts/auth_migration_audit.ts"
POLICY_FILE="$ROOT/shared/authRelinkPolicy.ts"

require_match() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if ! rg -n -S "$pattern" "$file" >/dev/null; then
    echo "FAIL: missing contract marker: $label"
    exit 1
  fi
  echo "OK: $label"
}

forbid_match() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if rg -n -S "$pattern" "$file" >/dev/null; then
    echo "FAIL: forbidden pattern detected: $label"
    rg -n -S "$pattern" "$file" || true
    exit 1
  fi
  echo "OK: $label"
}

echo "== Auth migration audit guard =="

require_match "$POLICY_FILE" 'isAnonymousAuthSubject' \
  "shared relink policy includes anonymous-subject detection"
require_match "$AUDIT_FILE" 'skippedAnonymousUserCount' \
  "audit reports skipped anonymous users"
require_match "$AUDIT_FILE" 'buildAuthenticatedEmailClusters' \
  "audit groups duplicate email across authenticated rows"
require_match "$AUDIT_FILE" 'classifyAuthRelinkBucket' \
  "audit uses shared fail-closed relink bucket policy"
require_match "$SCRIPT_FILE" 'ARX_AUTH_MIGRATION_AUDIT_SECRET' \
  "runner requires dedicated audit secret"

forbid_match "$AUDIT_FILE" 'ARX_AUTH_BRIDGE_SECRET' \
  "audit backend must not reuse auth bridge secret"
forbid_match "$SCRIPT_FILE" 'ARX_AUTH_BRIDGE_SECRET' \
  "audit runner must not reuse auth bridge secret"
forbid_match "$AUDIT_FILE" 'buildVerifiedEmailClusters' \
  "audit must not restrict duplicate grouping to verified rows"

echo "PASS: auth migration audit guard passed."
