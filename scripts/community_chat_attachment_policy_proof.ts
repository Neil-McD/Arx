import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const communityChat = readFileSync(join(root, "convex/communityChat.ts"), "utf8");
const gateway = readFileSync(join(root, "shared/cloudCommunityChatGateway.ts"), "utf8");
const mutationController = readFileSync(join(root, "shared/useCommunityChatMutationController.ts"), "utf8");

function extractNumberConst(source: string, name: string): number {
  const match = source.match(new RegExp(`const ${name} = ([0-9_]+);`));
  assert.ok(match, `expected const ${name}`);
  return Number(match[1].replaceAll("_", ""));
}

assert.match(
  packageJson,
  /"check:community-chat-attachment-policy-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_chat_attachment_policy_proof\.ts"/,
  "package scripts should expose the community chat attachment policy proof",
);

assert.equal(
  extractNumberConst(communityChat, "MAX_STORED_CHAT_ATTACHMENTS"),
  8,
  "backend should own the max community chat attachment count",
);
assert.equal(
  extractNumberConst(communityChat, "MAX_STORED_CHAT_IMAGE_DATA_URL_CHARS"),
  600000,
  "backend should cap stored image data URL fallbacks",
);

assert.match(
  communityChat,
  /raw\.length > MAX_STORED_CHAT_ATTACHMENTS[\s\S]*message_attachment_limit_exceeded/,
  "write normalization should reject over-limit attachment arrays",
);
assert.match(
  communityChat,
  /out\.length >= MAX_STORED_CHAT_ATTACHMENTS\) break;/,
  "read normalization should bound legacy attachment arrays without throwing",
);
assert.match(
  communityChat,
  /attachments\.length === 0[\s\S]*Array\.isArray\(record\.attachments\)[\s\S]*\{ \.\.\.record, attachments: \[\] \}/,
  "read mapping should not return unsanitized legacy attachment arrays when all entries are dropped",
);
assert.match(
  communityChat,
  /normalizedDataUrl\.startsWith\("data:image\/"\)[\s\S]*normalizedDataUrl\.length > MAX_STORED_CHAT_IMAGE_DATA_URL_CHARS[\s\S]*message_attachment_payload_too_large/,
  "write normalization should reject oversized image data URL fallbacks",
);
assert.match(
  communityChat,
  /const attachments = normalizeStoredChatAttachments\(args\.attachments, \{ enforceWritePolicy: true \}\);/,
  "message creation should use write-enforced attachment normalization",
);
assert.match(
  communityChat,
  /normalizeStoredChatAttachments\(\(args\.contentJson as Record<string, unknown>\)\.attachments, \{ enforceWritePolicy: true \}\)/,
  "message edits should use write-enforced attachment normalization",
);

assert.equal(
  extractNumberConst(gateway, "MAX_REACTION_MESSAGE_IDS_PER_REQUEST"),
  extractNumberConst(communityChat, "MAX_REACTION_MESSAGE_IDS_PER_REQUEST"),
  "live reaction subscription cap should match the backend reaction read cap",
);
assert.match(
  gateway,
  /\.slice\(0, MAX_REACTION_MESSAGE_IDS_PER_REQUEST\)/,
  "live reaction subscriptions should use the named reaction cap",
);

assert.match(
  mutationController,
  /message_attachment_limit_exceeded[\s\S]*You can attach up to 8 files per message/,
  "attachment count policy errors should map to user-facing chat copy",
);
assert.match(
  mutationController,
  /message_attachment_payload_too_large[\s\S]*One attachment preview is too large/,
  "attachment payload policy errors should map to user-facing chat copy",
);

console.log("community_chat_attachment_policy_proof: ok");
