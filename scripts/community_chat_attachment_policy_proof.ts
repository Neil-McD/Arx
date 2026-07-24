import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const packageJson = read("package.json");
const app = read("apps/web/src/App.tsx");
const attachmentBridge = read("convex/communityInteractionAttachmentBridge.ts");
const interactions = read("convex/communityInteractions.ts");
const communityChat = read("convex/communityChat.ts");
const facade = read("convex/community.ts");
const gateway = read("shared/cloudCommunityChatGateway.ts");
const mutationController = read("shared/useCommunityChatMutationController.ts");

assert.match(
  packageJson,
  /"check:community-chat-attachment-policy-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_chat_attachment_policy_proof\.ts"/,
  "package scripts should expose the community chat attachment policy proof",
);

assert.match(
  app,
  /const MAX_WEB_ATTACHMENTS_PER_MESSAGE = 8;[\s\S]*MAX_WEB_ATTACHMENTS_PER_MESSAGE - existing\.length[\s\S]*You can attach up to \$\{MAX_WEB_ATTACHMENTS_PER_MESSAGE\} files per message/,
  "the browser should enforce the eight-attachment composer limit before upload",
);
assert.match(
  attachmentBridge,
  /const MAX_INTERACTION_ATTACHMENTS = 8;[\s\S]*out\.length >= MAX_INTERACTION_ATTACHMENTS[\s\S]*normalizedDataUrl\.length <= MAX_INTERACTION_IMAGE_DATA_URL_CHARS/,
  "canonical attachment normalization should remain bounded",
);
assert.doesNotMatch(
  attachmentBridge,
  /CommunityChatMessageLike|readLegacyInteractionAttachmentPayloads|insertCanonicalInteractionAttachmentsFromLegacyMessage|legacy-chat:|MAX_LEGACY_|normalizeLegacyAttachmentKind|hasCanonicalInteractionAttachmentsForTarget|skipIfExisting/,
  "canonical attachment behavior should not retain deleted legacy migration vocabulary or materialization",
);
assert.match(
  interactions,
  /normalizeInteractionAttachmentInputs\(args\.attachments \?\? \[\]\)[\s\S]*insertCanonicalInteractionAttachmentsForTarget\(\{[\s\S]*rootId: root\._id,[\s\S]*attachments[\s\S]*insertCanonicalInteractionAttachmentsForTarget\(\{[\s\S]*replyId: reply\._id,[\s\S]*attachments/,
  "canonical composer writes should own root and reply attachment rows",
);
assert.match(
  communityChat,
  /generateCommunityChatAttachmentUploadUrl[\s\S]*requireCommunityChatAccess[\s\S]*requireProfileSetupCompleteForUser[\s\S]*ctx\.storage\.generateUploadUrl/,
  "the retained upload-url boundary should stay access and profile gated",
);
assert.match(
  gateway,
  /generateCommunityChatAttachmentUploadUrl[\s\S]*uploadCloudCommunityChatAttachmentFile/,
  "the browser should retain only the provider-bounded attachment upload path",
);

for (const [label, source] of [
  ["community chat backend", communityChat],
  ["community facade", facade],
  ["community chat gateway", gateway],
  ["send controller", mutationController],
] as const) {
  assert.doesNotMatch(
    source,
    /createThreadUserMessage|patchOwnMessageContent|deleteOwnMessage|createMessageReaction|listMessageReactions/,
    `${label} should not retain the legacy message mutation surface`,
  );
}
assert.doesNotMatch(
  mutationController,
  /message_attachment_limit_exceeded|message_attachment_payload_too_large/,
  "the canonical send controller should not retain error branches owned only by the deleted legacy writer",
);

console.log("community_chat_attachment_policy_proof: ok");
