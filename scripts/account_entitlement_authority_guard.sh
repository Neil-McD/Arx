#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

CORE_FILE="convex/accountEntitlementCore.ts"
SCHEMA_FILE="convex/schema.ts"
READERS=(
  convex/auth.ts
  convex/communityAdmin.ts
  convex/entitlements.ts
  convex/gates.ts
  convex/memberOntologyCore.ts
  convex/operatorIntelligence.ts
  convex/premiumMemberBadge.ts
)

echo "== Canonical account entitlement authority guard =="

if [[ -e convex/accountEntitlementMigration.ts ]]; then
  echo "FAIL: one-time account entitlement migration surface still exists" >&2
  exit 1
fi

DIRECT_READERS="$(rg -l 'query\("userEntitlements"\)' convex --glob '*.ts' --glob '!*.test.ts' || true)"
if [[ "$DIRECT_READERS" != "$CORE_FILE" ]]; then
  echo "FAIL: userEntitlements has a direct production reader outside $CORE_FILE" >&2
  printf '%s\n' "$DIRECT_READERS" >&2
  exit 1
fi

if ! rg -n -U 'readCanonicalAccountEntitlement\([\s\S]*?\.take\(MAX_CURRENT_SOURCE_ROWS \+ 1\)' "$CORE_FILE" >/dev/null; then
  echo "FAIL: canonical entitlement authority is not bounded" >&2
  exit 1
fi

if ! rg -n 'source: CurrentAccountEntitlementSource' "$CORE_FILE" >/dev/null; then
  echo "FAIL: entitlement writes are not constrained to current sources" >&2
  exit 1
fi

for reader in "${READERS[@]}"; do
  if ! rg -n 'readCanonicalAccountTier' "$reader" >/dev/null; then
    echo "FAIL: $reader does not use the canonical account-tier authority" >&2
    exit 1
  fi
done

if ! rg -n 'upsertCurrentAccountEntitlementSource' convex/auth.ts convex/premiumBilling.ts >/dev/null; then
  echo "FAIL: current entitlement writers do not use the idempotent source upsert" >&2
  exit 1
fi

node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const source = readFileSync("convex/schema.ts", "utf8");
const block = source.match(/userEntitlements: defineTable\(\{[\s\S]*?\n  \}\)/)?.[0] ?? "";
const required = ['v.literal("admin_override")', 'v.literal("premium_subscription")'];
const forbidden = ['v.literal("default")', 'v.literal("manual_grant")', 'by_user_startsAt'];
if (!required.every((marker) => block.includes(marker))) process.exit(1);
if (forbidden.some((marker) => block.includes(marker))) process.exit(1);
NODE

echo "PASS: account tier has one bounded reader, two constrained sources, and idempotent writers."
