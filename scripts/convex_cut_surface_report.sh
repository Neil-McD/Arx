#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGETS=(
  src
  apps
  shared
  src-tauri
)

EXCLUDES=(
  --glob '!**/node_modules/**'
)

count_matches() {
  local pattern="$1"
  (rg -n --hidden -S "$pattern" "${TARGETS[@]}" "${EXCLUDES[@]}" || true) | wc -l | tr -d ' '
}

count_matches_in_paths() {
  local pattern="$1"
  shift
  local paths=("$@")
  (rg -n --hidden -S "$pattern" "${paths[@]}" "${EXCLUDES[@]}" || true) | wc -l | tr -d ' '
}

count_matches_repo_wide() {
  local pattern="$1"
  (rg -n --hidden -S "$pattern" . "${EXCLUDES[@]}" || true) | wc -l | tr -d ' '
}

legacy_backend_markers="$(count_matches 's[u]pabase|@s[u]pabase')"
legacy_provider_markers_repo_wide="$(count_matches_repo_wide 's[u]pabase|@s[u]pabase|S[U]PABASE|s[b]_')"
legacy_function_refs="$(count_matches 'invokeFunctionAuthJson|invokeFunctionPublicJson|buildCloudFunctionUrl\(')"
convex_client_refs="$(count_matches 'ConvexHttpClient')"
convex_export_refs="$(rg -n --pcre2 'export const [A-Za-z0-9_]+\s*=\s*(query|mutation|action|internalQuery|internalMutation|internalAction)\(' convex --glob '!**/node_modules/**' | wc -l | tr -d ' ')"
rust_legacy_function_path_refs="$(
  count_matches_in_paths '/v1/(community_research|platform_agent_infer|public_turn|runtime_turn|list_enabled_model_registry|list_personal_memory_items|community_memory_candidate_propose)' \
    src-tauri/src/main.rs src-tauri/src/community_context.rs
)"

legacy_slug_inventory="$({
  (rg -n -o --pcre2 'slug:\s*"([a-z0-9_?=&-]+)"' "${TARGETS[@]}" "${EXCLUDES[@]}" || true) | sed -E 's/.*"([^"]+)"/\1/'
  (rg -n -o --pcre2 'buildCloudFunctionUrl\([^\n]+,\s*"([a-z0-9_?=&-]+)"' "${TARGETS[@]}" "${EXCLUDES[@]}" || true) | sed -E 's/.*"([^"]+)"/\1/'
  (rg -n --pcre2 '_SLUGS\s*=\s*\[' shared/cloudAuthCore.ts 2>/dev/null || true) \
    | sed -E 's/^[^:]+:[0-9]+://' \
    | grep -oE '"[a-z0-9_?=&-]+"' \
    | tr -d '"'
  (rg -n -o --pcre2 '/v1/([a-z0-9_]+)' src-tauri/src/main.rs src-tauri/src/community_context.rs 2>/dev/null || true) \
    | sed -E 's/.*\/v1\/([a-z0-9_]+).*/\1/'
  (rg -n -o --pcre2 'COMMUNITY_FUNCTION_[A-Z_]+:\s*&str\s*=\s*"([a-z0-9_]+)"' src-tauri/src/community_context.rs 2>/dev/null || true) \
    | sed -E 's/.*"([a-z0-9_]+)".*/\1/'
} | sort -u)"
legacy_slug_count="$(printf '%s\n' "$legacy_slug_inventory" | sed '/^$/d' | wc -l | tr -d ' ')"

combined_refs=$((legacy_function_refs + convex_client_refs))
if (( combined_refs == 0 )); then
  legacy_ratio_pct="0.00"
else
  legacy_ratio_pct="$(awk -v legacy="$legacy_function_refs" -v total="$combined_refs" 'BEGIN { printf "%.2f", (legacy / total) * 100 }')"
fi

printf '== Convex cut surface report ==\n'
printf 'Workspace: %s\n' "$ROOT_DIR"
printf 'Timestamp (UTC): %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
printf '\n'
printf 'Metrics:\n'
printf '  legacy_backend_markers_runtime_product=%s\n' "$legacy_backend_markers"
printf '  legacy_provider_marker_refs_repo_wide=%s\n' "$legacy_provider_markers_repo_wide"
printf '  legacy_function_transport_refs=%s\n' "$legacy_function_refs"
printf '  legacy_function_transport_refs_rust_function_paths=%s\n' "$rust_legacy_function_path_refs"
printf '  legacy_function_slug_count=%s\n' "$legacy_slug_count"
printf '  convex_http_client_refs=%s\n' "$convex_client_refs"
printf '  convex_exported_functions=%s\n' "$convex_export_refs"
printf '  legacy_transport_ratio_pct=%s\n' "$legacy_ratio_pct"
printf '\n'
printf 'Legacy function slugs still referenced (deduplicated):\n'
printf '%s\n' "$legacy_slug_inventory"
printf '\n'
printf 'Legacy transport refs by file:\n'
(rg -n 'invokeFunctionAuthJson|invokeFunctionPublicJson|buildCloudFunctionUrl\(' "${TARGETS[@]}" "${EXCLUDES[@]}" || true) \
  | awk -F: '{count[$1]++} END {for (file in count) print count[file] "\t" file}' \
  | sort -nr
