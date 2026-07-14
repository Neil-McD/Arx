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
const controller = read("shared/useCommunityResourceController.ts");
const panel = read("apps/web/src/components/CommunityResourcesPanel.tsx");
const viewer = read("apps/web/src/components/WebCommunityResourceViewerModal.tsx");
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

for (const source of [contracts, app, controller] as const) {
  assert.match(
    source,
    /body_chars\?: number \| null/,
    "frontend resource contracts must carry body_chars so stale metadata-only rows are not treated as empty pages",
  );
}

assert.match(
  core,
  /body_md: row\.bodyMd \?\? null,[\s\S]*body_chars: communityResourceBodyChars\(row\)/,
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
  /export const listCommunityResources = query\([\s\S]*\.map\(\(row\) => mapCommunityResourceRowWithBody\(ctx, row, userIdCache, moduleNameCache\)\)/,
  "main Resources UI list query must use the hydrated row mapper",
);
assert.match(
  resources,
  /export const readCommunityResourceDirectoryInternal = internalQuery\([\s\S]*const row = await hydrateCommunityResourceBody\(ctx, resolved\.resource\) \?\? resolved\.resource[\s\S]*const body = String\(row\.bodyMd \?\? ""\)[\s\S]*body_md: bodySlice/,
  "single member-visible resource reads must hydrate split body content before slicing response text",
);
assert.match(
  resources,
  /async function buildBatchReadResourceResult[\s\S]*const row = await hydrateCommunityResourceBody\(args\.ctx, resolved\.resource\) \?\? resolved\.resource[\s\S]*const body = String\(row\.bodyMd \?\? ""\)[\s\S]*body_md: bodySlice/,
  "batch resource reads must hydrate split body content before applying context budgets",
);
assert.match(
  resourceEvidence,
  /export const searchRecentCommunityResourceEvidenceInternal = internalQuery\([\s\S]*const hydrated = await Promise\.all\([\s\S]*hydrateCommunityResourceBody\(ctx, row\)[\s\S]*scoreResource\(resource, tokens\)/,
  "bounded resource evidence search must hydrate split body content before scoring and excerpting",
);
assert.match(
  resources,
  /async function readCommunityResourceBuilderResourceCore[\s\S]*target_type: "resource"[\s\S]*resource: await mapCommunityResourceRowWithBody\(args\.ctx, resolved\.resource\)/,
  "builder resource reads must hydrate split body content before exposing draft or source rows",
);
assert.match(
  core,
  /export function communityResourceHasUsableKnowledgeContent[\s\S]*communityResourceBodyChars\(row\) > 0/,
  "visibility checks must trust body_chars so split-body pages are not treated as empty",
);

assert.match(
  viewer,
  /function hasStoredBodyContent\(resource: CommunityResource\)[\s\S]*resource\.body_chars/,
  "viewer should detect persisted body content from body_chars",
);
assert.match(
  viewer,
  /const hasDeferredBody = !editor\?\.isEditing && !hasBody && hasStoredBodyContent\(resource\)/,
  "viewer should classify body_chars-without-body_md as deferred hydration",
);
assert.match(
  viewer,
  /const isEmpty = !embed && !hasBody && !hasDeferredBody && !verificationLink/,
  "viewer must not render empty-page copy when persisted body content exists",
);
assert.match(
  viewer,
  /if \(hasDeferredBody\) \{[\s\S]*Loading page content/,
  "viewer should show loading copy while persisted body content is being rehydrated",
);

assert.match(
  contracts,
  /reloadResources\?: \(\) => Promise<void> \| void/,
  "Resources actions should expose a narrow reload hook for impossible hydration states",
);
assert.match(
  panel,
  /function resourceNeedsBodyHydration\(resource: CommunityResource \| null\)[\s\S]*resource\.body_chars[\s\S]*!\(resource\.body_md \?\? ""\)\.trim\(\)/,
  "Resources panel should identify metadata rows whose body exists but was not hydrated",
);
assert.match(
  panel,
  /pendingBodyHydrationRefreshIdsRef[\s\S]*actions\.reloadResources/,
  "Resources panel should trigger a bounded reload for missing hydrated content",
);
assert.match(
  panel,
  /lastRenderableSelectedResourceRef[\s\S]*const readerResource =[\s\S]*isRefreshingResources[\s\S]*lastRenderableSelectedResourceRef\.current\?\.id === selectedResourceId/,
  "Resources reader should preserve the last valid selected resource while background refresh is in flight",
);
assert.match(
  panel,
  /readerResource \? \([\s\S]*resource=\{readerResource\}[\s\S]*editor=\{isReaderShowingRefreshSnapshot \? null : selectedResourceInlineEditor\}/,
  "Resources reader should keep rendering the previous resource snapshot during refresh without exposing stale edit controls",
);
assert.match(
  linkEmbedUi,
  /export const StableMediaEmbedFrame = memo\(function StableMediaEmbedFrame[\s\S]*data-resource-media="true"[\s\S]*src=\{props\.src\}/,
  "resource embeds should use one shared memoized media frame so ordinary resource text refreshes do not touch the player",
);
assert.match(
  viewer,
  /import \{ normalizeExternalUrl, parseEmbedUrl, StableMediaEmbedFrame \}[\s\S]*<StableMediaEmbedFrame[\s\S]*src=\{embed\.src\}/,
  "resource viewer should render URL embeds through the shared stable media frame component",
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
  /const renderedBodyMarkdown = useMemo\([\s\S]*renderMarkdown\(trimmedBody, \{ embedStandaloneMedia: true \}\)[\s\S]*\[hasBody, trimmedBody\]/,
  "resource body markdown should be memoized so unrelated reader state changes do not rebuild the media subtree",
);
assert.match(
  panel,
  /const isEditDisabled = resourceNeedsBodyHydration\(resource\)[\s\S]*disabled=\{isEditDisabled\}[\s\S]*if \(isEditDisabled\) return/,
  "rail edit controls must not open an empty editor while persisted body content is still hydrating",
);
assert.match(
  panel,
  /const selectedResourceInlineEditor =[\s\S]*canManageResources && selectedResource && !selectedResourceNeedsBodyHydration[\s\S]*startResourceInlineEdit\(selectedResource, field\)/,
  "selected page edit controls must wait for hydrated body content before editing",
);
assert.match(
  app,
  /reloadResources: async \(\) => \{[\s\S]*ensureUsableAuthSession\(\)[\s\S]*loadCommunityResources\(activeCommunityId, usableSession\)/,
  "App should wire Resources reload through the existing authenticated list path",
);

console.log("community resource content hydration contract proof passed");
