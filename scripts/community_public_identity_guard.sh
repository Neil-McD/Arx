#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== Community public identity guard =="

COMMUNITY_CHAT_FILE="convex/communityChat.ts"
COMMUNITY_ADMIN_FILE="convex/communityAdmin.ts"
COMMUNITY_CORE_FILE="convex/communityCore.ts"
RETIRED_COMMUNITY_EXPERIENCE_FILE="convex/communityExperience.ts"
COMMUNITY_LIFECYCLE_FILE="convex/communityLifecycle.ts"
COMMUNITY_PUBLIC_FILE="convex/communityPublic.ts"

if [[ -f "convex/community.ts" ]]; then
  echo "FAIL: retired community compatibility facade must stay deleted"
  exit 1
fi
if [[ ! -f "$COMMUNITY_CHAT_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_CHAT_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_ADMIN_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_ADMIN_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_CORE_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_CORE_FILE"
  exit 1
fi
if [[ -f "$RETIRED_COMMUNITY_EXPERIENCE_FILE" ]]; then
  echo "FAIL: retired facade must stay deleted: $RETIRED_COMMUNITY_EXPERIENCE_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_LIFECYCLE_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_LIFECYCLE_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_PUBLIC_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_PUBLIC_FILE"
  exit 1
fi

require_multiline_match() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if ! rg -n -U --pcre2 "$pattern" "$file" >/dev/null; then
    echo "FAIL: missing contract marker: $description"
    exit 1
  fi
  echo "OK: $description"
}

echo "[1/9] Ensuring public user-ID resolver exists..."
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function resolvePublicUserId\(\s*ctx: any,\s*rawUserId: unknown,' \
  "resolvePublicUserId helper exists"

echo "[2/9] Ensuring chat and reaction payloads resolve browser-facing IDs..."
require_multiline_match "$COMMUNITY_CHAT_FILE" \
  'async function mapCommunityChatMessageRow\([\s\S]*?sender_id: await resolvePublicUserId\(ctx, row\.senderUserId, userIdCache\)' \
  "community chat rows resolve public sender IDs"
require_multiline_match "$COMMUNITY_CHAT_FILE" \
  'async function mapCommunityMessageReactionRow\([\s\S]*?user_id:\s*\(await resolvePublicUserId\(ctx, row\.userId, userIdCache\)\) \?\?\s*String\(row\.userId\)' \
  "community reaction rows resolve public user IDs"

echo "[3/9] Ensuring core community records resolve public owner IDs..."
require_multiline_match "$COMMUNITY_LIFECYCLE_FILE" \
  'async function mapCommunityRecord\([\s\S]*?owner_id:\s*\(await resolvePublicUserId\(ctx, row\.ownerId, userIdCache\)\) \?\?\s*String\(row\.ownerId\)' \
  "community records resolve public owner IDs"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityMemberships = query\([\s\S]*?owner_id:\s*\(await resolvePublicUserId\(ctx, community\.ownerId, userIdCache\)\) \?\?\s*String\(community\.ownerId\)' \
  "membership list resolves public owner IDs"

echo "[4/10] Ensuring community access payloads resolve public user IDs..."
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function resolveCommunityAccessBundle\([\s\S]*?user_id:\s*\(await resolvePublicUserId\(args\.ctx, args\.userId\)\) \?\?\s*String\(args\.userId\)' \
  "community access rows resolve public user IDs"

echo "[5/10] Ensuring public community stats resolve online faces to public IDs..."
require_multiline_match "$COMMUNITY_PUBLIC_FILE" \
  'async function resolvePublicCommunityStats\([\s\S]*?user_id:\s*\(await resolvePublicUserId\(ctx, user\._id, userIdCache\)\) \?\?\s*String\(user\._id\)' \
  "public community stats resolve online faces to public IDs"

echo "[6/10] Ensuring membership and join-request admin payloads resolve public IDs..."
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityJoinRequests = query\([\s\S]*?user_id:\s*\(await resolvePublicUserId\(ctx, row\.userId, userIdCache\)\) \?\?\s*String\(row\.userId\)' \
  "join-request rows resolve public user IDs"

echo "[7/10] Ensuring member-settings payloads resolve public IDs..."
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function mapCommunityMemberSettingsRow\([\s\S]*?user_id:\s*\(await resolvePublicUserId\(ctx, row\.userId, userIdCache\)\) \?\?\s*String\(row\.userId\)' \
  "member settings rows resolve public user IDs"

echo "[8/10] Ensuring resource payloads resolve public IDs..."
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function mapCommunityResourceRow\([\s\S]*?created_by:\s*\(await resolvePublicUserId\(ctx, row\.createdByUserId, userIdCache\)\) \?\?\s*String\(row\.createdByUserId\)' \
  "resource rows resolve public creator IDs"

echo "[9/10] Ensuring chat message sender IDs stay in the same public namespace..."
require_multiline_match "$COMMUNITY_CHAT_FILE" \
  'sender_id: await resolvePublicUserId\(ctx, row\.senderUserId, userIdCache\)' \
  "chat message rows use public sender IDs"

echo "[10/10] Guard passed."
echo "PASS: community browser-facing user references are normalized to public IDs."
