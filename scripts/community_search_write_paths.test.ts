import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// Search rows are rebuilt in the same write as their post. Any code that
// creates posts or replies, or changes their text, status, channel or
// visibility, must call the post-write hook (which syncs search) or the sync
// itself. A new write path that does neither fails here.
const CONVEX = join(__dirname, "..", "convex");
const SYNC = /scheduleCommunityInteractionEvidenceSync|syncCommunitySearchDoc|backfillCommunitySearchDocsInternal/;
const WRITES_POSTS = /insert\(\s*"communityInteraction(Roots|Replies)"/;
const PATCHES_POST_FIELDS = /\.patch\([^)]*\{[^}]*\b(contentSummary|status|channelId|visibilityScope)\s*:/;

// Files that touch these fields on other tables only, each with the reason.
const NOT_POST_WRITES: Record<string, string> = {
  "communityChannels.ts": "patches channels; post rows follow through relabelCommunitySearchChannelInternal",
  "communityAttachmentUploads.ts": "patches attachment upload rows' status, not posts",
  "communityMemberWorkflows.ts": "patches workflow runs' status, not posts",
};

function sources(): string[] {
  return readdirSync(CONVEX).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.startsWith("_"));
}

test("every file that creates posts or replies keeps search in step", () => {
  const missing = sources().filter((name) => {
    const text = readFileSync(join(CONVEX, name), "utf8");
    return WRITES_POSTS.test(text) && !SYNC.test(text);
  });
  expect(missing).toEqual([]);
});

test("every file that patches a post's text, status, channel or visibility keeps search in step", () => {
  const missing = sources().filter((name) => {
    if (NOT_POST_WRITES[name]) return false;
    const text = readFileSync(join(CONVEX, name), "utf8");
    if (!/communityInteraction(Roots|Replies)/.test(text)) return false;
    return PATCHES_POST_FIELDS.test(text) && !SYNC.test(text);
  });
  expect(missing).toEqual([]);
});

test("channel access changes, renames and deletion relabel the channel's rows", () => {
  const text = readFileSync(join(CONVEX, "communityChannels.ts"), "utf8");
  expect(text.match(/relabelCommunitySearchChannelInternal/g)?.length).toBe(3);
});

test("every file that hard-deletes posts or replies clears their search rows", () => {
  const missing = sources().filter((name) => {
    const text = readFileSync(join(CONVEX, name), "utf8");
    // Deleting rows read from the post tables, e.g. seed cleanup.
    const deletesPosts = /(query\(\s*table\s*\)|query\(\s*"communityInteraction(Roots|Replies)"\s*\))[\s\S]*\.delete\(/.test(text)
      && /"communityInteraction(Roots|Replies)"/.test(text);
    return deletesPosts && !SYNC.test(text);
  });
  expect(missing).toEqual([]);
});
