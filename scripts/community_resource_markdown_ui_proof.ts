import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

const markdown = read("shared/markdownUi.tsx");
const resourceViewer = read("apps/web/src/components/WebCommunityResourceViewerModal.tsx");
const linkEmbedUi = read("shared/linkEmbedUi.tsx");
const css = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");
const packageJson = read("package.json");

assert.match(
  markdown,
  /import \{ parseEmbedUrl, StableMediaEmbedFrame, type ParsedEmbed \} from "\.\/linkEmbedUi";/,
  "markdown renderer should reuse the canonical supported-media embed parser",
);
assert.match(
  linkEmbedUi,
  /export const StableMediaEmbedFrame = memo\(function StableMediaEmbedFrame[\s\S]*data-resource-media="true"/,
  "supported media embeds should share a stable iframe component with a media interaction marker",
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
  resourceViewer,
  /RESOURCE_BODY_INTERACTIVE_SELECTOR[\s\S]*iframe[\s\S]*\[data-resource-media='true'\][\s\S]*target\.closest\(RESOURCE_BODY_INTERACTIVE_SELECTOR\)[\s\S]*interactiveTarget && interactiveTarget !== event\.currentTarget/,
  "Resources viewer body edit trigger should not intercept media-player clicks",
);
assert.match(
  css,
  /\.resource-course-workspace \{[\s\S]*grid-template-columns: minmax\(220px, 270px\) minmax\(0, 1fr\)/,
  "selected courses should reserve a compact lesson outline beside the reader",
);
assert.match(
  css,
  /\.resource-course-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  "Resources root should present courses as a two-column catalog when space allows",
);
assert.match(
  css,
  /@media \(max-width: 900px\) \{[\s\S]*\.resource-course-workspace \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)[\s\S]*\.resource-course-outline \.knowledge-resource-list \{[\s\S]*max-height: min\(42vh, 320px\)[\s\S]*overflow-y: auto/,
  "selected courses should collapse to a bounded top lesson outline on narrow screens",
);
assert.match(
  css,
  /@media \(max-width: 640px\) \{[\s\S]*\.resource-course-grid \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/,
  "course cards should collapse to one column on phone-sized screens",
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
