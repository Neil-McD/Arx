import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const packageJson = read("package.json");
const policy = read("shared/communityAttachmentPolicy.ts");
const bridge = read("convex/communityInteractionAttachmentBridge.ts");
const interactions = read("convex/communityInteractions.ts");
const composerController = read("apps/web/src/controllers/useWebCommunityChatController.ts");

assert.match(
  packageJson,
  /"check:community-chat-attachment-policy-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_chat_attachment_policy_proof\.ts"/,
  "package scripts should expose the community chat attachment policy proof",
);
assert.match(policy, /export const COMMUNITY_ATTACHMENT_MAX_COUNT = 8;/, "one shared policy owns the per-message attachment count");
assert.match(
  bridge,
  /args\.attachments\.length > COMMUNITY_ATTACHMENT_MAX_COUNT\) throw new Error\("message_attachment_limit_exceeded"\)/,
  "claiming rejects over-limit attachment arrays",
);
assert.match(
  interactions,
  /if \(!input\.attachmentId\) \{\s*throw new Error\("Please reattach this file before sending/,
  "only uploaded attachment ids are honored; inline attachment payloads are refused",
);
assert.doesNotMatch(read("convex/communityChat.ts"), /attachments/, "the old chat attachment path stays deleted");
assert.match(
  composerController,
  /message_attachment_limit_exceeded[\s\S]*You can attach up to 8 files per message/,
  "attachment count policy errors should map to user-facing chat copy",
);

console.log("community_chat_attachment_policy_proof: ok");
