import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

const markdown = read("shared/markdownUi.tsx");
const resourceViewer = read("apps/web/src/components/WebCommunityResourceViewerModal.tsx");
const css = read("apps/web/src/base.css");
const packageJson = read("package.json");

assert.match(
  markdown,
  /import \{ parseEmbedUrl, type ParsedEmbed \} from "\.\/linkEmbedUi";/,
  "markdown renderer should reuse the canonical supported-media embed parser",
);
assert.match(
  markdown,
  /embedStandaloneMedia\?: boolean/,
  "markdown renderer should expose opt-in standalone media embeds",
);
assert.match(
  markdown,
  /standaloneMediaEmbedFromChildren[\s\S]*parseEmbedUrl\(href\)/,
  "markdown renderer should embed only standalone supported media links",
);
assert.match(
  markdown,
  /return <ArtifactBlock label="text" text=\{trimmed\} extension="txt" onCopyText=\{onCopyText\} \/>/,
  "plain multiline text blocks should render through the copyable artifact block",
);
assert.match(
  resourceViewer,
  /renderMarkdown\(trimmedBody,\s*\{\s*embedStandaloneMedia: true\s*\}\)/,
  "Resources viewer should opt into standalone media embeds",
);
assert.match(
  css,
  /grid-template-columns: minmax\(176px, 224px\) minmax\(0, 1fr\)/,
  "Resources wiki rail should stay compact",
);
assert.match(
  css,
  /\.knowledge-resource-rail \{[\s\S]*position: sticky;[\s\S]*top: 4px;[\s\S]*max-height: calc\(100dvh - 24px\);[\s\S]*overflow: hidden;/,
  "Resources wiki rail should stay visible while scrolling desktop resource content",
);
assert.match(
  css,
  /@media \(max-width: 900px\) \{[\s\S]*\.knowledge-resource-rail \{[\s\S]*position: static;[\s\S]*max-height: none;[\s\S]*overflow: visible;/,
  "Resources wiki rail should not use sticky side navigation on mobile",
);
assert.match(
  css,
  /\.resource-viewer-prose \.md-media-embed-frame[\s\S]*aspect-ratio: 16 \/ 9[\s\S]*iframe/,
  "Resources prose should style inline media embeds as stable video frames",
);
assert.match(
  packageJson,
  /"check:community-resource-markdown-ui-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_resource_markdown_ui_proof\.ts"/,
  "community resource markdown UI proof should be wired into package scripts",
);

console.log("community_resource_markdown_ui_proof: ok");
