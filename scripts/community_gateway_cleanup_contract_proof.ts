import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const gatewayFiles = [
  "shared/cloudCommunityAdminGateway.ts",
  "shared/cloudCommunityMembershipGateway.ts",
  "shared/cloudCommunityAccessGateway.ts",
  "shared/cloudCommunityAgentGateway.ts",
  "shared/cloudCommunityChatGateway.ts",
] as const;
const resourceController = readFileSync(join(root, "shared/useCommunityResourceController.ts"), "utf8");
const accessController = readFileSync(join(root, "shared/useWebCommunityAccessController.ts"), "utf8");
const eventsController = readFileSync(join(root, "shared/useCommunityEventsController.ts"), "utf8");

assert.match(
  packageJson,
  /"check:community-gateway-cleanup-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_gateway_cleanup_contract_proof\.ts"/,
  "package scripts should expose the community gateway cleanup proof",
);

for (const file of gatewayFiles) {
  const source = readFileSync(join(root, file), "utf8");
  assert.doesNotMatch(source, /init\?: RequestInit|void params\.init/, `${file} should not advertise ignored Convex RequestInit params`);
}

const extinctExportsByFile = {
  "shared/cloudCommunityAdminGateway.ts": [
    "loadCloudCommunityGoogleDriveSourceConnection",
    "loadCloudCommunityGitHubSourceConnection",
    "listCloudCommunityRevenueSeriesRows",
    "listCloudCommunityFunnelVisitCreatedAtRows",
    "fetchCloudCommunityAnalyticsSummary",
    "countCloudCommunityResourceRows",
  ],
  "shared/cloudCommunityMembershipGateway.ts": [
    "listCloudCommunityMembershipAdminPage",
    "listCloudCommunityMembershipCreatedAtRows",
  ],
  "shared/cloudCommunityAgentGateway.ts": [
    "fetchActiveCloudCommunityAgentSystemPrompt",
    "fetchActiveCloudCommunityAgentLanding",
  ],
  "shared/cloudCommunityChatGateway.ts": [
    "subscribeCloudThreadMessages",
    "subscribeCloudMessageReactions",
    "deleteCloudMessageReactionById",
    "createCloudMessageReaction",
    "patchCloudOwnMessageContent",
    "deleteCloudOwnMessage",
    "ensureCloudCommunityChatThread",
    "listCloudCommunityActivityEvents",
    "listCloudMessageReactions",
  ],
  "shared/cloudThreadsRead.ts": [
    "isConvexCloudThreadsEnabled",
    "listConvexCloudThreadRows",
    "getConvexCloudThreadRowByThreadKey",
    "listConvexCloudThreadMessagesPageByThreadKey",
    "listConvexCloudThreadMessagesByThreadKey",
    "getConvexCloudRunningRuntimeRunByThreadKey",
  ],
  "shared/cloudThreadsGateway.ts": [
    "updateCloudThreadRecord",
    "requestCloudThreadAttachmentUploadUrl",
    "uploadCloudThreadAttachmentFile",
    "archiveCloudThreadRecord",
  ],
  "shared/modelCatalog.ts": [
    "DEFAULT_GUEST_MODEL_ID",
    "FREE_MODEL_LABELS",
    "getFreeModelEntries",
    "getPublicFreeModelMap",
    "getModelCatalog",
    "supportsModelFundingSource",
    "isModelAvailableOnSurface",
    "inferModelProviderId",
  ],
  "shared/voiceCapture.ts": [
    "VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES",
    "VOICE_TRANSCRIPTION_MAX_DURATION_MS",
    "normalizeVoiceTranscriptionMimeType",
    "selectVoiceCaptureMimeType",
    "getVoiceAudioContextConstructor",
    "getVoiceUserMedia",
    "floatToInt16Pcm",
    "createWavBlobFromInt16Chunks",
  ],
} as const;

for (const [file, names] of Object.entries(extinctExportsByFile)) {
  const source = readFileSync(join(root, file), "utf8");
  for (const name of names) {
    assert.equal(source.includes(name), false, `${file} should not restore dead export ${name}`);
  }
}

for (const [label, source] of [
  ["resource controller", resourceController],
  ["access controller", accessController],
  ["events controller", eventsController],
] as const) {
  assert.doesNotMatch(source, /communityFetchAbortScope|beginScopedAbortRequest|finishScopedAbortRequest|abortAllScopedRequests|isAbortError/, `${label} should not keep fake Convex abort plumbing`);
  assert.doesNotMatch(source, /init:\s*\{\s*signal:/, `${label} should not pass fake abort signals into Convex gateways`);
}

assert.match(
  resourceController,
  /communityId !== current\.activeCommunityId[\s\S]*moduleLoadGenerationRef[\s\S]*const generation = \+\+ref\.current[\s\S]*scopeRef\.current === requestScope && ref\.current === generation[\s\S]*if \(!isCurrent\(\)\) return;[\s\S]*current\.setCommunityResourceModules\(rows\)/,
  "module loads should guard stale results and community changes before setting module state",
);
assert.match(
  resourceController,
  /communityId !== current\.activeCommunityId[\s\S]*collection === "resources" \? resourceLoadGenerationRef[\s\S]*const generation = \+\+ref\.current[\s\S]*scopeRef\.current === requestScope && ref\.current === generation[\s\S]*if \(!isCurrent\(\)\) return;[\s\S]*current\.setCommunityResources\(rows\)/,
  "resource loads should guard stale results and community changes before setting resource state",
);
assert.match(
  accessController,
  /const seq = \(loadCommunitiesSeqRef\.current \+= 1\)[\s\S]*const isCurrentRequest = \(\)[\s\S]*loadingResetKey[\s\S]*if \(!isCurrentRequest\(\)\) return;[\s\S]*latest\.setCommunities\(\(previous\) => reuseEquivalentValue\(previous, list\)\)/,
  "community access loads should guard stale results and identity changes before setting communities",
);
assert.equal(
  existsSync(join(root, "shared/communityFetchAbortScope.ts")),
  false,
  "dead community fetch abort helper should be deleted once Convex gateways no longer consume fake RequestInit signals",
);

console.log("community_gateway_cleanup_contract_proof: ok");
