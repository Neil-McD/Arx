#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MANIFEST_PATH="$ROOT_DIR/supabase/functions/deployment-manifest.json"
FUNCTIONS_DIR="$ROOT_DIR/supabase/functions"

PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
DRY_RUN=0

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/community_edge_manifest_deploy.sh [--project-ref <ref>] [--dry-run]

Behavior:
  - Reads active function slugs from supabase/functions/deployment-manifest.json
  - Validates each function directory + config.toml verify_jwt against manifest
  - Deploys exactly those slugs (in manifest order) to the target Supabase project

Options:
  --project-ref <ref>  Explicit Supabase project ref (overrides SUPABASE_PROJECT_REF)
  --dry-run            Print deployment plan without deploying
  --help               Show this message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-ref)
      if [[ $# -lt 2 ]]; then
        echo "FAIL: --project-ref requires a value"
        exit 1
      fi
      PROJECT_REF="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "FAIL: unknown argument '$1'"
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "FAIL: missing deployment manifest at $MANIFEST_PATH"
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "FAIL: supabase CLI is required to deploy edge functions"
  exit 1
fi

if [[ -z "$PROJECT_REF" && -f "$ROOT_DIR/.env" ]]; then
  SUPABASE_URL_LINE="$(grep -E '^VITE_SUPABASE_URL=' "$ROOT_DIR/.env" | head -n1 || true)"
  SUPABASE_URL="${SUPABASE_URL_LINE#VITE_SUPABASE_URL=}"
  DERIVED_REF="$(printf '%s' "$SUPABASE_URL" | sed -E 's#^https://([a-z0-9]+)\.supabase\.co/?$#\1#')"
  if [[ -n "$DERIVED_REF" && "$DERIVED_REF" != "$SUPABASE_URL" ]]; then
    PROJECT_REF="$DERIVED_REF"
  fi
fi

if [[ -z "$PROJECT_REF" ]]; then
  echo "FAIL: missing project ref. Set SUPABASE_PROJECT_REF or pass --project-ref."
  exit 1
fi

MANIFEST_ENTRIES=()
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  MANIFEST_ENTRIES+=("$line")
done < <(
  MANIFEST_PATH="$MANIFEST_PATH" node <<'NODE'
const fs = require("fs");

const manifestPath = process.env.MANIFEST_PATH;
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(`unable to parse deployment manifest (${error.message})`);
}

const active = Array.isArray(manifest?.active_functions) ? manifest.active_functions : null;
if (!active || active.length === 0) {
  fail("deployment manifest must contain a non-empty active_functions array");
}

const seen = new Set();
for (const entry of active) {
  const slug = String(entry?.slug ?? "").trim();
  if (!slug) fail("manifest contains an entry with empty slug");
  if (seen.has(slug)) fail(`manifest contains duplicate slug '${slug}'`);
  seen.add(slug);

  if (typeof entry?.verify_jwt !== "boolean") {
    fail(`manifest entry '${slug}' must set boolean verify_jwt`);
  }

  process.stdout.write(`${slug}|${entry.verify_jwt}\n`);
}
NODE
)

if [[ "${#MANIFEST_ENTRIES[@]}" -eq 0 ]]; then
  echo "FAIL: manifest produced no active function entries"
  exit 1
fi

echo "== Community edge manifest deploy =="
echo "Project ref: $PROJECT_REF"
echo "Manifest: $MANIFEST_PATH"
echo "Functions: ${#MANIFEST_ENTRIES[@]}"

for entry in "${MANIFEST_ENTRIES[@]}"; do
  slug="${entry%%|*}"
  expected_verify="${entry##*|}"
  function_dir="$FUNCTIONS_DIR/$slug"
  index_file="$function_dir/index.ts"
  config_file="$function_dir/config.toml"

  if [[ ! -d "$function_dir" ]]; then
    echo "FAIL: missing function directory for '$slug' at $function_dir"
    exit 1
  fi
  if [[ ! -f "$index_file" ]]; then
    echo "FAIL: missing index.ts for '$slug' at $index_file"
    exit 1
  fi
  if [[ ! -f "$config_file" ]]; then
    echo "FAIL: missing config.toml for '$slug' at $config_file"
    exit 1
  fi

  actual_verify="$(sed -nE 's/^[[:space:]]*verify_jwt[[:space:]]*=[[:space:]]*(true|false)[[:space:]]*$/\1/p' "$config_file" | head -n1)"
  if [[ -z "$actual_verify" ]]; then
    echo "FAIL: missing verify_jwt assignment in $config_file"
    exit 1
  fi
  if [[ "$actual_verify" != "$expected_verify" ]]; then
    echo "FAIL: verify_jwt mismatch for '$slug' (manifest=$expected_verify, config=$actual_verify)"
    exit 1
  fi
done

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY RUN: deployment plan"
  for entry in "${MANIFEST_ENTRIES[@]}"; do
    slug="${entry%%|*}"
    echo "- $slug"
  done
  exit 0
fi

for entry in "${MANIFEST_ENTRIES[@]}"; do
  slug="${entry%%|*}"
  expected_verify="${entry##*|}"
  echo "Deploying '$slug'..."
  deploy_args=(--workdir "$ROOT_DIR" functions deploy "$slug" --project-ref "$PROJECT_REF")
  if [[ "$expected_verify" == "false" ]]; then
    deploy_args+=(--no-verify-jwt)
  fi
  supabase "${deploy_args[@]}"
done

echo "PASS: deployed manifest-defined function surface (${#MANIFEST_ENTRIES[@]} functions)."
