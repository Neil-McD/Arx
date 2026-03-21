#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.worktrees' \
  --exclude='references/repos' \
  --exclude='.vercel/output' \
  --exclude='apps/web/.vercel/output' \
  "$repo_root/" "$tmpdir/"

cd "$tmpdir"
vercel deploy --prod --yes --archive=tgz
