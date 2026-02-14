import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error(message);
}

async function readText(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  return fs.readFile(filePath, "utf8");
}

function assertIncludesAll(label, text, required) {
  for (const token of required) {
    if (!text.includes(token)) {
      fail(`${label} is missing required citation wiring token: ${token}`);
    }
  }
}

function assertIncludesAny(label, text, required) {
  for (const token of required) {
    if (text.includes(token)) return;
  }
  fail(`${label} is missing required citation wiring token: ${required.join(" OR ")}`);
}

async function main() {
  const desktopApp = await readText("src/App.tsx");
  const webApp = await readText("apps/web/src/App.tsx");
  const citationsComponent = await readText("shared/CommunityEvidenceCitations.tsx");
  const citationsUi = await readText("shared/communityEvidenceUi.ts");
  const attachmentChipButton = await readText("shared/AttachmentChipButton.tsx");
  const communityChatMediaGrid = await readText("shared/CommunityChatMediaGrid.tsx");
  const communityAttachmentUi = await readText("shared/communityAttachmentUi.ts");
  const sharedCommunityMessageRow = await readText("shared/CommunityChatMessageRow.tsx");
  const inferenceSourceUi = await readText("shared/inferenceSourceUi.ts");
  const messageFooterActions = await readText("shared/MessageFooterActions.tsx");
  const messageContextUi = await readText("shared/messageContextUi.ts");
  const desktopCss = await readText("src/index.css");

  assertIncludesAll("desktop app", desktopApp, [
    "extractCommunityEvidenceUsedV1",
    "communityEvidence.items.slice(0, 4)",
    "CommunityEvidenceCitations",
    "actionTitle=\"Open source details\"",
    "MessageFooter",
    "MessageCopyAction",
    "MessageSourcesAction",
    "CommunityChatMessageRow",
    "partitionCommunityAttachments",
    "appendInferenceSourceLabel",
    "title=\"Sources used\"",
  ]);

  assertIncludesAll("web app", webApp, [
    "extractCommunityEvidenceUsedV1",
    "communityEvidence.items.slice(0, 4)",
    "CommunityEvidenceCitations",
    "actionTitle=\"Open source details\"",
    "MessageFooter",
    "MessageCopyAction",
    "MessageContextAction",
    "MessageRegenerateAction",
    "AttachmentChipButton",
    "CommunityChatMessageRow",
    "partitionCommunityAttachments",
    "appendInferenceSourceLabel",
    "buildMessageContextModalPayload",
    "hasContextPayload",
    "contextActionLabel",
    "openMessageContextModal",
  ]);

  assertIncludesAll("shared citations component", citationsComponent, [
    "className=\"message-citations\"",
    "className=\"message-citation-chip\"",
    "formatCommunityEvidenceTypeLabel(",
    "summarizeCommunityEvidenceSnippet(",
    "title={actionTitle}",
  ]);

  assertIncludesAll("shared citation UI helper", citationsUi, [
    "formatCommunityEvidenceTypeLabel",
    "summarizeCommunityEvidenceSnippet",
  ]);

  assertIncludesAll("shared attachment chip button", attachmentChipButton, [
    "export function AttachmentChipButton",
    "className = \"attachment-item attachment-chip\"",
    "className=\"attachment-thumb\"",
    "className=\"attachment-name\"",
  ]);

  assertIncludesAll("shared community chat media grid", communityChatMediaGrid, [
    "export type CommunityChatMediaImage",
    "export function CommunityChatMediaGrid",
    "className=\"chat-media-item\"",
    "className=\"chat-media-more\"",
  ]);

  assertIncludesAll("shared community attachment partition helper", communityAttachmentUi, [
    "export function partitionCommunityAttachments",
    "attachment.type === \"image\"",
    "attachment.data_url.startsWith(\"data:image/\")",
    "fileAttachments.push(attachment)",
  ]);

  assertIncludesAll("shared community message row component", sharedCommunityMessageRow, [
    "export function CommunityChatMessageRow",
    "CommunityChatMediaGrid",
    "AttachmentChipButton",
    "onOpenCommunityChatLightbox",
    "reaction-picker",
  ]);

  assertIncludesAll("shared inference source UI helper", inferenceSourceUi, [
    "export function formatInferenceSourceLabel",
    "export function appendInferenceSourceLabel",
    "if (raw === \"platform\") return \"Arx\"",
    "if (raw === \"user\") return \"User key\"",
    "if (raw === \"chatgpt\") return \"ChatGPT\"",
  ]);

  assertIncludesAll("shared message footer actions", messageFooterActions, [
    "className=\"message-footer\"",
    "className = \"message-copy-btn\"",
    "export function MessageCopyAction",
    "export function MessageSourcesAction",
    "export function MessageContextAction",
    "export function MessageRegenerateAction",
  ]);

  assertIncludesAll("shared message context helper", messageContextUi, [
    "export type MessageContextModalPayload",
    "export function buildMessageContextModalPayload",
    "export function hasContextPayload",
    "export function contextActionLabel",
    "export function openMessageContextModal",
  ]);

  assertIncludesAll("desktop citation css", desktopCss, [
    ".message-citations",
    ".message-citation-chip",
    ".message-citation-kind",
    ".message-citation-text",
  ]);

  console.log("PASS: inline citation regression checks passed.");
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
