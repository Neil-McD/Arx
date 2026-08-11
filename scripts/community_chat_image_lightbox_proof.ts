import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const attachmentUi = readFileSync(join(root, "shared/communityAttachmentUi.ts"), "utf8");
const mediaGrid = readFileSync(join(root, "shared/CommunityChatMediaGrid.tsx"), "utf8");
const messageRow = readFileSync(join(root, "shared/CommunityChatMessageRow.tsx"), "utf8");
const lightbox = readFileSync(join(root, "apps/web/src/components/WebCommunityChatLightboxModal.tsx"), "utf8");
const css = [
  readFileSync(join(root, "apps/web/src/base.css"), "utf8"),
  readFileSync(join(root, "apps/web/src/styles/community-and-content.css"), "utf8"),
].join("\n");

assert.match(
  packageJson,
  /"check:community-chat-image-lightbox-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_chat_image_lightbox_proof\.ts"/,
  "package scripts should expose the community chat image lightbox proof",
);

assert.match(
  attachmentUi,
  /const previewUrl = dataUrl \|\| storageUrl \|\| "";[\s\S]*const fullUrl = storageUrl \|\| dataUrl \|\| "";/,
  "community image attachments should preserve compressed previews and storage-backed full URLs",
);

assert.match(
  mediaGrid,
  /id\?: string;[\s\S]*previewUrl\?: string;[\s\S]*fullUrl\?: string;/,
  "community chat media images should carry stable identity plus preview and full URL fields",
);

assert.match(
  mediaGrid,
  /<img src=\{img\.previewUrl \|\| img\.url\}/,
  "message image grids should prefer preview URLs instead of forcing full-resolution images into the feed",
);

assert.match(
  messageRow,
  /id: item\.attachment\.id,[\s\S]*url: item\.previewUrl,[\s\S]*previewUrl: item\.previewUrl,[\s\S]*fullUrl: item\.fullUrl,/,
  "message rows should pass image identity plus preview and full image URLs to the media/lightbox model",
);

assert.match(
  lightbox,
  /const activeUrl = active\.fullUrl \|\| active\.url;[\s\S]*<img src=\{activeUrl\}/,
  "lightbox should render the full image URL when storage provided one",
);

assert.match(
  lightbox,
  /event\.key === "Escape"[\s\S]*event\.key === "ArrowLeft"[\s\S]*event\.key === "ArrowRight"/,
  "lightbox should support keyboard close and navigation",
);

assert.match(
  css,
  /\.modal\.lightbox-modal \{[\s\S]*width: 100vw;[\s\S]*height: 100svh;[\s\S]*max-height: none;/,
  "lightbox should override the generic modal frame and use the full viewport",
);

assert.match(
  css,
  /\.modal\.lightbox-modal \.lightbox-body img \{[\s\S]*width: 100%;[\s\S]*height: 100%;[\s\S]*object-fit: contain;/,
  "lightbox images should fill the viewport box without cropping",
);

console.log("community_chat_image_lightbox_proof: ok");
