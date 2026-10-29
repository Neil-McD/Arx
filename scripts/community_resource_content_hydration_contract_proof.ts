import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageJson = read("package.json");
const contracts = read("apps/web/src/components/communityResourcesContracts.ts");
const app = read("apps/web/src/App.tsx");
const webContentController = read(
  "apps/web/src/controllers/useWebCommunityContentController.ts",
);
const controller = read("shared/useCommunityResourceController.ts");
const panel = read("apps/web/src/components/CommunityResourcesPanel.tsx");
const viewer = read("apps/web/src/components/WebCommunityResourceViewerContent.tsx");
const deferredYouTube = read("apps/web/src/components/DeferredYouTubeEmbed.tsx");
const resources = read("convex/communityResources.ts");
const resourceEvidence = read("convex/communityResourceEvidence.ts");
const core = read("convex/communityCore.ts");
const content = read("convex/communityResourceContent.ts");
const markdown = read("shared/markdownUi.tsx");
const linkEmbedUi = read("shared/linkEmbedUi.tsx");

assert.match(
  packageJson,
  /"check:community-resource-content-hydration-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_resource_content_hydration_contract_proof\.ts"/,
  "resource content hydration proof should be wired into package scripts",
);

for (const source of [contracts, webContentController, controller] as const) {
  assert.match(
    source,
    /body_chars\?: number \| null/,
    "frontend resource contracts must carry body_chars so stale metadata-only rows are not treated as empty pages",
  );
}

assert.match(
  core,
  /body_md: (?:row\.)?bodyMd \?\? null,[\s\S]*body_chars: communityResourceBodyChars\(row\)/,
  "Convex resource mapper must expose both hydrated body_md and body_chars",
);
assert.match(
  content,
  /export async function hydrateCommunityResourceBody[\s\S]*getCommunityResourceContentRow[\s\S]*bodyMd: bodyMd \|\| undefined[\s\S]*bodyChars:/,
  "resource body hydration must read split body storage and return bodyMd/bodyChars together",
);
assert.match(
  content,
  /export async function writeCommunityResourceBodyContent[\s\S]*ctx\.db\.insert\("communityResourceContents"[\s\S]*bodyMd,[\s\S]*bodyChars,[\s\S]*bodyHash,[\s\S]*await ctx\.db\.patch\(args\.resourceId[\s\S]*bodyMd: undefined,[\s\S]*bodyChars,[\s\S]*bodyHash,[\s\S]*bodyMigratedAt:/,
  "resource body writes must persist markdown in the split content table while leaving body counters on the resource row",
);
assert.match(
  resources,
  /async function mapCommunityResourceRowWithBody[\s\S]*hydrateCommunityResourceBody\(ctx, row\)[\s\S]*mapCommunityResourceRow\(ctx, hydrated/,
  "resource list mapper must hydrate split body content before projecting rows to clients",
);
assert.match(
  resources,
  /export const listCommunityResources = query\([\s\S]*\.map\(async \(row\) => \{[\s\S]*mapCommunityResourceRowWithBody\(ctx, row, \{ canManage: canManageResources \}, userIdCache, moduleNameCache\)/,
  "main Resources UI list query must use the hydrated row mapper",
);
assert.match(
  resources,
  /export const readCommunityResourceDirectoryInternal = internalQuery\([\s\S]*const row = await hydrateCommunityResourceBody\(ctx, resolved\.resource\) \?\? resolved\.resource[\s\S]*const body = (?:String\(row\.bodyMd \?\? ""\)|memberLessonBody\(row\))[\s\S]*body_md: bodySlice/,
  "single member-visible resource reads must hydrate split body content before slicing response text",
);
assert.match(
  resourceEvidence,
  /export const searchRecentCommunityResourceEvidenceInternal = internalQuery\([\s\S]*const hydrated = await Promise\.all\([\s\S]*hydrateCommunityResourceBody\(ctx, row\)[\s\S]*scoreResource\(resource, tokens\)/,
  "bounded resource evidence search must hydrate split body content before scoring and excerpting",
);
assert.match(
  resources,
  /async function readCommunityResourceBuilderResourceCore[\s\S]*target_type: "resource"[\s\S]*resource: await mapCommunityResourceRowWithBody\(args\.ctx, resolved\.resource(?:, \{ canManage: true \})?\)/,
  "builder resource reads must hydrate split body content before exposing draft or source rows",
);
assert.match(
  core,
  /export function communityResourceHasUsableKnowledgeContent[\s\S]*communityResourceBodyChars\(row\) > 0/,
  "visibility checks must trust body_chars so split-body pages are not treated as empty",
);

assert.doesNotMatch(
  [contracts, app, webContentController, panel, viewer].join("\n"),
  /reloadResources|reloadActiveResources|resourceNeedsBodyHydration|pendingBodyHydrationRefreshIdsRef|lastRenderableSelectedResourceRef|hasDeferredBody|Loading lesson content/,
  "the client must trust the canonical hydrated list instead of retaining a duplicate whole-list retry and stale snapshot state machine",
);
assert.match(
  viewer,
  /const isEmpty = !embed && !hasBody && !verificationLink/,
  "the viewer should derive its empty state directly from the canonical hydrated resource",
);
assert.match(
  linkEmbedUi,
  /export const StableMediaEmbedFrame = memo\(function StableMediaEmbedFrame[\s\S]*data-resource-media="true"[\s\S]*src=\{props\.src\}/,
  "resource embeds should use one shared memoized media frame so ordinary resource text refreshes do not touch the player",
);
assert.match(
  viewer,
  /embed\.provider === "youtube"[\s\S]*<DeferredYouTubeEmbed[\s\S]*<StableMediaEmbedFrame[\s\S]*src=\{embed\.src\}/,
"resource viewer should defer YouTube loading while keeping one stable frame for other media providers",
);
assert.match(
  deferredYouTube,
  /export function DeferredYouTubeEmbed[\s\S]*IntersectionObserver[\s\S]*<iframe[\s\S]*sandbox=/,
  "chat and Resources should share one native, viewport-loaded YouTube implementation",
);
assert.match(
  markdown,
  /import \{ parseEmbedUrl, StableMediaEmbedFrame, type ParsedEmbed \}[\s\S]*<StableMediaEmbedFrame[\s\S]*src=\{embed\.src\}/,
  "markdown standalone media embeds should render through the same stable media frame component",
);
assert.match(
  viewer,
  /RESOURCE_BODY_INTERACTIVE_SELECTOR[\s\S]*iframe[\s\S]*\[data-resource-media='true'\][\s\S]*target\.closest\(RESOURCE_BODY_INTERACTIVE_SELECTOR\)[\s\S]*interactiveTarget && interactiveTarget !== event\.currentTarget/,
  "click-to-edit body handling must not steal clicks from media or iframe players",
);
assert.match(
  viewer,
  /const renderedBodyMarkdown = useMemo\([\s\S]*renderMarkdown\([\s\S]*CONTENT_MARKDOWN_OPTIONS,[\s\S]*headingLevelOffset: 1,[\s\S]*\}, \[shownBody,/,
  "resource body markdown should be memoized and hierarchy-scoped so unrelated reader state changes do not rebuild the media subtree",
);
console.log("community resource content hydration contract proof passed");
