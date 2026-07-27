import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isCommunityLaunchKnowledgeRequestCurrent,
  partitionCommunityLaunchKnowledgeSources,
} from "../apps/web/src/controllers/useWebCommunityLaunchKnowledgeController.ts";
import type { CloudCommunityLaunchKnowledgeSource } from "../shared/cloudCommunityAdminGateway.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function source(
  overrides: Partial<CloudCommunityLaunchKnowledgeSource>,
): CloudCommunityLaunchKnowledgeSource {
  return {
    id: "source",
    title: "Source",
    source_ingestion_status: "queued",
    source_ingestion_kind: "url",
    source_ingestion_error: null,
    source_external_provider: null,
    source_external_id: null,
    source_external_name: null,
    source_external_url: "https://example.com",
    source_external_mime_type: null,
    source_external_modified_at: null,
    credential_status: "available",
    credential_message: null,
    updated_at: null,
    ...overrides,
  };
}

const grouped = partitionCommunityLaunchKnowledgeSources([
  source({ id: "link", source_ingestion_kind: "url" }),
  source({ id: "file", source_ingestion_kind: "file" }),
  source({
    id: "drive",
    source_ingestion_kind: "url",
    source_external_provider: "google_drive",
  }),
  source({
    id: "github",
    source_ingestion_kind: "file",
    source_external_provider: "github",
  }),
]);
assert.deepEqual(
  {
    links: grouped.links.map((item) => item.id),
    files: grouped.files.map((item) => item.id),
    googleDrive: grouped.googleDrive.map((item) => item.id),
    github: grouped.github.map((item) => item.id),
  },
  {
    links: ["link"],
    files: ["file"],
    googleDrive: ["drive"],
    github: ["github"],
  },
  "provider-owned source rows must be partitioned before generic ingestion kind",
);

const currentRequest = {
  requestId: 9,
  activeRequestId: 9,
  requestSessionKey: "user-a",
  activeSessionKey: "user-a",
  requestCommunityId: "community-a",
  activeCommunityId: "community-a",
  canManageCommunitySettings: true,
};
assert.equal(
  isCommunityLaunchKnowledgeRequestCurrent(currentRequest),
  true,
  "the exact active manager request may project source state",
);
for (const staleRequest of [
  { ...currentRequest, activeRequestId: 10 },
  { ...currentRequest, activeSessionKey: "user-b" },
  { ...currentRequest, activeCommunityId: "community-b" },
  { ...currentRequest, canManageCommunitySettings: false },
]) {
  assert.equal(
    isCommunityLaunchKnowledgeRequestCurrent(staleRequest),
    false,
    "stale subject, target, generation, or permission must fail closed",
  );
}

const appShell = read("apps/web/src/App.tsx");
const controller = read(
  "apps/web/src/controllers/useWebCommunityLaunchKnowledgeController.ts",
);
const model = read(
  "apps/web/src/components/webCommunityLaunchKnowledgeModel.ts",
);
const setupModal = read(
  "apps/web/src/components/WebCommunityLaunchSetupModal.tsx",
);
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const resources = read("convex/communityResources.ts");
const schema = read("convex/schema.ts");

assert.equal(
  (
    appShell.match(
      /useWebCommunityLaunchKnowledgeController<AuthSession>\(\{/g,
    ) ?? []
  ).length,
  1,
  "App must instantiate exactly one launch Knowledge controller",
);
assert.match(
  appShell,
  /const communityLaunchKnowledgeModel =[\s\S]*useWebCommunityLaunchKnowledgeController<AuthSession>[\s\S]*<WebCommunityLaunchSetupModal[\s\S]*knowledge=\{communityLaunchKnowledgeModel\}/,
  "App must pass one nested Knowledge model into the launch modal",
);
assert.match(
  setupModal,
  /knowledge: WebCommunityLaunchKnowledgeModel[\s\S]*sources: \{[\s\S]*links: knowledgeLinkSources[\s\S]*sourceActions: \{[\s\S]*addLinks: onAddKnowledgeLink[\s\S]*googleDrive: \{[\s\S]*github: \{[\s\S]*assembly: \{/,
  "the launch modal must consume source, integration, and assembly behavior through the nested model",
);
assert.match(
  model,
  /export type WebCommunityLaunchKnowledgeModel = \{[\s\S]*sources: WebCommunityLaunchKnowledgeSourceGroups[\s\S]*sourceActions: \{[\s\S]*googleDrive: \{[\s\S]*github: \{[\s\S]*assembly: \{/,
  "the typed model must preserve the four irreducible Knowledge capabilities",
);

for (const deletedOwner of [
  "communityLaunchLinkSources",
  "communityLaunchFileSources",
  "communityLaunchGoogleDriveSources",
  "communityLaunchGitHubSources",
  "handleAddCommunityLaunchKnowledgeLink",
  "handleAddCommunityLaunchKnowledgeFile",
  "handleLoadCommunityLaunchKnowledgeSources",
  "handleIngestCommunityLaunchKnowledgeSources",
  "handleConnectCommunityLaunchGoogleDrive",
  "handleConnectCommunityLaunchGitHub",
  "handleGenerateCommunityLaunchKnowledgePlan",
  "handleApplyCommunityLaunchKnowledgePlan",
  "handleDraftCommunityLaunchKnowledgeResources",
]) {
  assert.doesNotMatch(
    appShell,
    new RegExp(deletedOwner),
    `App must not retain duplicate launch Knowledge owner ${deletedOwner}`,
  );
}
for (const knowledgeGatewayCall of [
  "listCloudCommunityLaunchKnowledgeSources",
  "beginCloudCommunityGoogleDriveSourceOAuth",
  "beginCloudCommunityGitHubSourceOAuth",
  "ingestCloudCommunitySources",
  "runCloudCommunityWikiArchitectProposal",
  "applyCloudCommunityWikiArchitectProposal",
  "draftCloudCommunityResourceContentFromSources",
]) {
  assert.doesNotMatch(
    appShell,
    new RegExp(knowledgeGatewayCall),
    `App must not call Knowledge gateway operation ${knowledgeGatewayCall}`,
  );
  assert.match(
    controller,
    new RegExp(knowledgeGatewayCall),
    `the Knowledge controller must own gateway operation ${knowledgeGatewayCall}`,
  );
}

assert.match(
  controller,
  /requireOperationContext[\s\S]*!params\.session \|\| !params\.sessionKey[\s\S]*!params\.activeCommunity\?\.id \|\| !params\.activeCommunity\.slug[\s\S]*!params\.canManageCommunitySettings[\s\S]*assertContextCurrent\(context\)/,
  "every operation must fail closed on session, target, and manager authority",
);
assert.match(
  controller,
  /assertContextCurrent[\s\S]*The active community changed\. Reopen Knowledge and try again\.[\s\S]*params\.activeCommunity\?\.id,[\s\S]*params\.activeCommunity\?\.slug,[\s\S]*params\.session,[\s\S]*params\.sessionKey/,
  "operation callbacks must bind to their render target and reject continuation after a subject or community change",
);
assert.match(
  controller,
  /sourceRequestIdRef[\s\S]*isCommunityLaunchKnowledgeRequestCurrent\(\{[\s\S]*activeSessionKey: latest\.sessionKey[\s\S]*activeCommunityId: latest\.communityId[\s\S]*canManageCommunitySettings: latest\.canManageCommunitySettings/,
  "source projection must be guarded by request generation, subject, target, and manager authority",
);
assert.match(
  controller,
  /useEffect\(\(\) => \{[\s\S]*sourceRequestIdRef\.current \+= 1[\s\S]*setSources\(EMPTY_SOURCE_GROUPS\)[\s\S]*params\.activeCommunity\?\.id[\s\S]*params\.canManageCommunitySettings[\s\S]*params\.sessionKey/,
  "subject, community, or permission changes must invalidate requests and clear source state",
);
assert.doesNotMatch(
  controller,
  /window\.location|window\.history|finalizeCloudCommunity|createCloudCommunity|saveCloudCommunityProfile|setCloudCommunityFreeAccessMode/,
  "the Knowledge controller must not absorb browser, OAuth-finalization, creation, profile, or access authorities",
);
assert.match(
  appShell,
  /finalizeCloudCommunityGitHubSourceOAuth[\s\S]*finalizeCloudCommunityGoogleDriveSourceOAuth/,
  "OAuth callback finalization must remain an app-shell authority",
);
assert.match(
  appShell,
  /writeCommunityLaunchKnowledgeSourceOAuthIntent[\s\S]*window\.location\.assign\(request\.authorizeUrl\)/,
  "durable OAuth intent and the external navigation boundary must remain in App",
);

assert.match(
  gateway,
  /listCloudCommunityLaunchKnowledgeSources[\s\S]*community:listCommunityLaunchKnowledgeSources/,
  "the controller must retain the focused cloud source projection",
);
assert.match(
  resources,
  /listCommunityLaunchKnowledgeSources = query\([\s\S]*requireCommunityManager\(\{[\s\S]*communityId: args\.communityId[\s\S]*\.query\("communityResources" as any\)[\s\S]*\.eq\("role", "source"\)/,
  "canonical source rows must remain community-owned and manager-gated",
);
assert.match(
  schema,
  /userSourceIntegrationConnections: defineTable\(\{[\s\S]*userId: v\.id\("users"\)[\s\S]*provider: v\.union\(v\.literal\("google_drive"\), v\.literal\("github"\)\)[\s\S]*\.index\("by_user_provider", \["userId", "provider"\]\)/,
  "provider credentials must remain user-owned and indexed independently of community source rows",
);

console.log(
  "PASS: community launch Knowledge has one typed, fail-closed web orchestration owner.",
);
