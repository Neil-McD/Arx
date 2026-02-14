#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MVP_MARKER=".worktrees/mvp"

count_lines() {
  awk 'NF { count += 1 } END { print count + 0 }'
}

print_section() {
  local title="$1"
  echo
  echo "== $title =="
}

supabase_mcp_lines="$(pgrep -fl "mcp-server-supabase|npm exec @supabase/mcp-server-supabase@" || true)"
mvp_vite_lines="$(pgrep -fl "vite" | rg "$MVP_MARKER" || true)"
mvp_tauri_lines="$(pgrep -fl "tauri dev|npm run tauri dev" | rg "$MVP_MARKER" || true)"

supabase_mcp_count="$(printf '%s\n' "$supabase_mcp_lines" | count_lines)"
mvp_vite_count="$(printf '%s\n' "$mvp_vite_lines" | count_lines)"
mvp_tauri_count="$(printf '%s\n' "$mvp_tauri_lines" | count_lines)"

print_section "Process Hygiene Status"
echo "repo: $ROOT_DIR"
echo "supabase mcp processes (all repos): $supabase_mcp_count"
echo "vite processes (mvp): $mvp_vite_count"
echo "tauri dev processes (mvp): $mvp_tauri_count"

print_section "Active MVP Vite"
if [ "$mvp_vite_count" -gt 0 ]; then
  printf '%s\n' "$mvp_vite_lines" | sed -n '1,20p'
else
  echo "(none)"
fi

print_section "Active MVP Tauri"
if [ "$mvp_tauri_count" -gt 0 ]; then
  printf '%s\n' "$mvp_tauri_lines" | sed -n '1,20p'
else
  echo "(none)"
fi

print_section "Flags"
echo "--kill-mvp-dev           kill mvp vite/tauri processes only"
echo "--kill-supabase-mcp-all  kill all supabase mcp helper processes"
echo "--full-clean             run both kill modes above"

run_kill_mvp_dev=false
run_kill_supabase_mcp=false

for arg in "$@"; do
  case "$arg" in
    --kill-mvp-dev)
      run_kill_mvp_dev=true
      ;;
    --kill-supabase-mcp-all)
      run_kill_supabase_mcp=true
      ;;
    --full-clean)
      run_kill_mvp_dev=true
      run_kill_supabase_mcp=true
      ;;
    *)
      echo "Unknown flag: $arg"
      echo "Use: $0 [--kill-mvp-dev] [--kill-supabase-mcp-all] [--full-clean]"
      exit 1
      ;;
  esac
done

if [ "$run_kill_mvp_dev" = true ]; then
  print_section "Killing MVP dev processes"
  if [ "$mvp_tauri_count" -gt 0 ]; then
    printf '%s\n' "$mvp_tauri_lines" | awk '{print $1}' | xargs -n1 kill -9 || true
  fi
  if [ "$mvp_vite_count" -gt 0 ]; then
    printf '%s\n' "$mvp_vite_lines" | awk '{print $1}' | xargs -n1 kill -9 || true
  fi
  echo "done"
fi

if [ "$run_kill_supabase_mcp" = true ]; then
  print_section "Killing supabase mcp helper processes"
  pkill -f "npm exec @supabase/mcp-server-supabase@" || true
  pkill -f "mcp-server-supabase --project-ref" || true
  echo "done"
fi

if [ "$run_kill_mvp_dev" = true ] || [ "$run_kill_supabase_mcp" = true ]; then
  print_section "Restart"
  echo "cd $ROOT_DIR"
  echo "npm run tauri dev"
fi
