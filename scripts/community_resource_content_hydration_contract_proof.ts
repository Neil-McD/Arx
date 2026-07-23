import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mergeCommunityResourceContentRow,
  mergeCommunityResourceDirectoryRows,
} from "../shared/communityResourceDirectoryState.ts";

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
const recentContext = read("convex/communityRecentContext.ts");
const emailDigests = read("convex/emailDigests.ts");
const core = read("convex/communityCore.ts");
const content = read("convex/communityResourceContent.ts");
const markdown = read("shared/markdownUi.tsx");
const linkEmbedUi = read("shared/linkEmbedUi.tsx");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const experience = read("convex/communityExperience.ts");

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
  /export async function hydrateCommunityResourceBody[\s\S]*getCommunityResourceContentRow[\s\S]*bodyMd: content\.bodyMd[\s\S]*bodyChars: content\.bodyChars[\s\S]*bodyHash: content\.bodyHash/,
  "resource body hydration must read split body storage and return bodyMd/bodyChars together",
);
assert.match(
  content,
  /export async function writeCommunityResourceBodyContent[\s\S]*ctx\.db\.insert\("communityResourceContents"[\s\S]*bodyMd,[\s\S]*bodyChars,[\s\S]*bodyHash,[\s\S]*await ctx\.db\.patch\(args\.resourceId[\s\S]*bodyChars,[\s\S]*updatedAt:/,
  "resource body writes must persist markdown and hashes only in the split content table while leaving the list counter on the resource row",
);
assert.match(
  content,
  /\.take\(2\)[\s\S]*community_resource_content_duplicate/,
  "resource content lookup must fail closed instead of selecting an arbitrary duplicate",
);
assert.doesNotMatch(
  content,
  /resource\.bodyMd|bodyMigratedAt|bodyHash:\s*undefined/,
  "canonical body storage must not read or maintain inline resource-body compatibility",
);
assert.doesNotMatch(
  resources,
  /compactCommunityResourceBodyStorage/,
  "temporary body-storage compaction must be absent after canonical closure",
);
assert.match(
  resources,
  /async function mapCommunityResourceRowWithBody[\s\S]*hydrateCommunityResourceBody\(ctx, row\)[\s\S]*mapCommunityResourceRow\(ctx, hydrated/,
  "the exact resource mapper must hydrate split body content before projecting rows to clients",
);
assert.match(
  resources,
  /const COMMUNITY_RESOURCE_UI_DIRECTORY_LIMIT = 200/,
  "the Resources UI directory must have one explicit fixed capacity",
);
assert.match(
  resources,
  /export const listCommunityResources = query\([\s\S]*\.take\(COMMUNITY_RESOURCE_UI_DIRECTORY_LIMIT \+ 1\)[\s\S]*truncated[\s\S]*modules:[\s\S]*resources,/,
  "the Resources UI directory must return one bounded modules-and-resources snapshot with truncation truth",
);
assert.match(
  resources,
  /export const listCommunityResources = query\([\s\S]*\.map\(\(row\) => mapCommunityResourceRow\(ctx, row, userIdCache, moduleNameCache\)\)/,
  "the Resources UI directory must project metadata without hydrating every body",
);
const listCommunityResourcesBlock =
  resources.match(/export const listCommunityResources = query\([\s\S]*?\n\}\);\n\nexport const readCommunityResource = query\(/)?.[0] ?? "";
assert.doesNotMatch(
  listCommunityResourcesBlock,
  /mapCommunityResourceRowWithBody|hydrateCommunityResourceBody/,
  "the bounded Resources UI directory must not amplify reads by hydrating body content",
);
assert.match(
  resources,
  /export const readCommunityResource = query\([\s\S]*requireCommunityChatAccess[\s\S]*ctx\.db\.get\(args\.resourceId\)[\s\S]*community_resource_not_found[\s\S]*communityResourceIsLiveModulePage[\s\S]*mapCommunityResourceRowWithBody\(ctx, resource\)/,
  "one exact authorized UI read must hydrate only the selected resource body and fail closed for hidden rows",
);
assert.doesNotMatch(
  resources,
  /export const listCommunityResourceModules = query\(/,
  "the duplicate standalone module-list query must be deleted",
);
assert.doesNotMatch(
  experience,
  /listCommunityResourceModules/,
  "the deleted standalone module-list query must not remain exported",
);
assert.match(
  gateway,
  /export async function listCloudCommunityResourceDirectory[\s\S]*community:listCommunityResources[\s\S]*payload\.modules[\s\S]*payload\.resources[\s\S]*community_resource_directory_invalid/,
  "the web gateway must validate the combined directory envelope",
);
assert.match(
  gateway,
  /export async function readCloudCommunityResource[\s\S]*community:readCommunityResource[\s\S]*resourceId/,
  "the web gateway must expose one exact selected-resource read",
);
assert.doesNotMatch(
  gateway,
  /listCloudCommunityResourceRows|listCloudCommunityResourceModuleRows/,
  "duplicate web list gateways must be deleted",
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
  recentContext,
  /async function listRecentResourceItems[\s\S]*hydrateCommunityResourceBody\(args\.ctx, row\)[\s\S]*snippetSource = \[row\.title, row\.bodyMd/,
  "recent context must hydrate canonical resource bodies before matching or excerpting",
);
assert.match(
  emailDigests,
  /async function listRecentResources[\s\S]*hydrateCommunityResourceBody\(ctx, row\)[\s\S]*buildDigestItems/,
  "weekly digest resource summaries must hydrate canonical body content before rendering",
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
  /loadResourceContent: \(resourceId: string, expectedUpdatedAt: string \| null\) => Promise<boolean>[\s\S]*reloadDirectory: \(\) => Promise<void>/,
  "Resources actions should separate exact content reads from whole-directory retry",
);
assert.match(
  panel,
  /function resourceNeedsBodyHydration\(resource: CommunityResource \| null\)[\s\S]*resource\.body_chars[\s\S]*!\(resource\.body_md \?\? ""\)\.trim\(\)/,
  "Resources panel should identify metadata rows whose body exists but was not hydrated",
);
assert.match(
  panel,
  /pendingBodyHydrationKeysRef[\s\S]*actions\.loadResourceContent\(resource\.id, resource\.updated_at \?\? null\)[\s\S]*setBodyHydrationErrorKey/,
  "Resources panel should deduplicate exact body reads by resource version and expose failure state",
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
  /loadResourceContent: loadCommunityResourceContent[\s\S]*reloadDirectory: async \(\) => \{[\s\S]*ensureUsableAuthSession\(\)[\s\S]*loadCommunityResources\(activeCommunityId, usableSession\)/,
  "App should wire exact content reads separately from authenticated directory retry",
);

type TestResource = {
  id: string;
  community_id: string;
  body_md: string | null;
  body_chars: number;
  updated_at: string;
  title: string;
};

const hydratedV1: TestResource = {
  id: "resource-a",
  community_id: "community-a",
  body_md: "canonical body",
  body_chars: 14,
  updated_at: "2026-07-23T10:00:00.000Z",
  title: "A",
};
const metadataV1: TestResource = { ...hydratedV1, body_md: null };
assert.deepEqual(
  mergeCommunityResourceDirectoryRows([hydratedV1], [metadataV1]),
  [hydratedV1],
  "same-version directory refresh should retain an already hydrated body",
);
const metadataV2: TestResource = {
  ...metadataV1,
  updated_at: "2026-07-23T10:01:00.000Z",
};
assert.deepEqual(
  mergeCommunityResourceDirectoryRows([hydratedV1], [metadataV2]),
  [metadataV2],
  "newer metadata must evict a stale hydrated body",
);
assert.equal(
  mergeCommunityResourceContentRow({
    rows: [metadataV1],
    resource: hydratedV1,
    communityId: "community-a",
    expectedUpdatedAt: metadataV1.updated_at,
  }).accepted,
  true,
  "an exact current-version body should merge",
);
for (const rejected of [
  {
    rows: [metadataV2],
    resource: hydratedV1,
    communityId: "community-a",
    expectedUpdatedAt: metadataV1.updated_at,
  },
  {
    rows: [metadataV2],
    resource: hydratedV1,
    communityId: "community-a",
    expectedUpdatedAt: metadataV2.updated_at,
  },
  {
    rows: [metadataV1],
    resource: { ...hydratedV1, community_id: "community-b" },
    communityId: "community-a",
    expectedUpdatedAt: metadataV1.updated_at,
  },
  {
    rows: [metadataV1],
    resource: { ...hydratedV1, body_md: null },
    communityId: "community-a",
    expectedUpdatedAt: metadataV1.updated_at,
  },
] as const) {
  assert.equal(
    mergeCommunityResourceContentRow(rejected).accepted,
    false,
    "stale, cross-community, and impossible empty body responses must be rejected",
  );
}

console.log("community resource content hydration contract proof passed");
