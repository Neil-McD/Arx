// Guards the canonical framed media architecture across the web app and shared
// UI primitives so community logos, community banners, user/host avatars, pod
// covers, and course covers cannot silently drift back onto raw <img> tags or
// CSS background-image bypasses.
//
// Usage: node scripts/canonical_media_guard.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["apps/web/src", "shared"];

// Files legitimately allowed to render raw <img> tags:
// - The canonical framed media primitive itself
// - The 3 interactive framing/crop editor modals
// - Content images (chat/DM attachments, lightbox, upload previews, markdown/lesson images)
// - Static Polynet brand assets
const ALLOWED_RAW_IMG_FILES = new Set([
  "shared/StableFramedMedia.tsx",
  "shared/CommunityChatMediaGrid.tsx",
  "shared/AttachmentChipButton.tsx",
  "apps/web/src/components/WebCommunityAvatarEditorModal.tsx",
  "apps/web/src/components/WebCommunityBannerEditorModal.tsx",
  "apps/web/src/components/WebUserAvatarEditorModal.tsx",
  "apps/web/src/components/WebCommunityAgentDock.tsx",
  "apps/web/src/components/WebCommunityChatLightboxModal.tsx",
  "apps/web/src/components/WebCommunityChatPanel.tsx",
  "apps/web/src/components/WebDirectMessagePanel.tsx",
  "apps/web/src/components/communityInteractionFeed.tsx",
  "apps/web/src/components/lessonEditor/LessonEditorNodeViews.tsx",
  "apps/web/src/components/WebOnboardingPage.tsx",
  "apps/web/src/components/WebPlatformBridgePage.tsx",
  "apps/web/src/v1/KitGuideAsks.tsx",
]);

function walkTsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      results.push(...walkTsFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    if (entry === "DesignLab.tsx") continue;
    results.push(full);
  }
  return results;
}

const RAW_IMG_PATTERN = /<img\b/;
const CSS_BG_URL_PATTERN = /\bbackgroundImage\s*:|["']--banner["']\s*:\s*[^,\n}]*url\(/;

const failures = [];
const scanned = [];

for (const dir of SCAN_DIRS) {
  for (const fullPath of walkTsFiles(join(ROOT, dir))) {
    const rel = relative(ROOT, fullPath).replace(/\\/g, "/");
    scanned.push(rel);
    const source = readFileSync(fullPath, "utf8");

    if (RAW_IMG_PATTERN.test(source) && !ALLOWED_RAW_IMG_FILES.has(rel)) {
      failures.push(
        `${rel}: raw <img> outside canonical media allowlist (use CommunityAvatar, UserAvatar, or StableFramedMedia for identity/cover imagery, or document a content-image allowlist entry)`,
      );
    }

    if (CSS_BG_URL_PATTERN.test(source)) {
      failures.push(
        `${rel}: CSS backgroundImage/--banner url() bypass detected (use StableFramedMedia instead)`,
      );
    }
  }
}

if (failures.length) {
  console.error(
    `canonical_media_guard: ${failures.length} violation(s):\n${failures.join("\n")}`,
  );
  process.exit(1);
}

console.log(
  `canonical_media_guard: ok (${scanned.length} files scanned, ${ALLOWED_RAW_IMG_FILES.size} allowlisted content/editor/canonical img files)`,
);
