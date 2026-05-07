import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function assertNotIncludes(haystack: string, needle: string, label: string) {
  assert.ok(!haystack.includes(needle), `expected ${label} not to include ${needle}`);
}

function main() {
  const root = process.cwd();
  const communityAppMounts = readText(join(root, "convex/communityAppMounts.ts"));
  const userPlatformAppMounts = readText(
    join(root, "convex/userPlatformAppMounts.ts"),
  );
  const billingCore = readText(join(root, "convex/billingCore.ts"));
  const communityAdmin = readText(join(root, "convex/communityAdmin.ts"));
  const communityPublic = readText(join(root, "convex/communityPublic.ts"));
  const platformHomeCommunity = readText(join(root, "convex/platformHomeCommunity.ts"));
  const schema = readText(join(root, "convex/schema.ts"));
  const httpDaytona = readText(join(root, "convex/httpDaytona.ts"));
  const runtimeExecutionSession = readText(
    join(root, "convex/runtimeExecutionSession.ts"),
  );
  const runtimeMcpManager = readText(
    join(root, "convex/runtimeMcpManager.ts"),
  );
  const appEditor = readText(join(root, "apps/web/src/components/WebCommunityAiAgentAppsEditor.tsx"));
  const communityAppMountTypes = readText(
    join(root, "shared/communityAppMountTypes.ts"),
  );
  const cloudCommunityAppMountGateway = readText(
    join(root, "shared/cloudCommunityAppMountGateway.ts"),
  );
  const webDiscoverPanel = readText(
    join(root, "apps/web/src/components/WebDiscoverPanel.tsx"),
  );
  const communityAppsController = readText(
    join(root, "apps/web/src/controllers/useWebCommunityAppsController.ts"),
  );
  const appShell = readText(join(root, "apps/web/src/App.tsx"));

  for (const exportedName of [
    "export const connectCommunityApp = action({",
    "export const refreshCommunityApp = action({",
    "export const updateCommunityAppMount = mutation({",
    "export const unmountCommunityApp = action({",
  ]) {
    assertIncludes(communityAppMounts, exportedName, "community app lifecycle surface");
  }

  for (const deletedRuntimeSurface of [
    "export const listRuntimeCommunityMountedToolsInternal",
    "export const executeCommunityMountedAppToolInternal",
    "type RuntimeMountedCommunityAppTool",
    "resolveRuntimeMountedCommunityAppTools",
  ]) {
    assertNotIncludes(
      communityAppMounts,
      deletedRuntimeSurface,
      "deleted community MCP runtime surface",
    );
  }

  assertIncludes(
    communityAppMounts,
    "internal.appValidation.validateDeveloperAppInternal",
    "community app validation lifecycle",
  );
  assertIncludes(
    communityAppMounts,
    "toolSnapshotId: v.optional(v.id(\"appToolSnapshots\"))",
    "community setup-needed mounts allow missing snapshots",
  );
  assertIncludes(
    userPlatformAppMounts,
    "toolSnapshotId: v.optional(v.id(\"appToolSnapshots\"))",
    "personal setup-needed mounts allow missing snapshots",
  );
  assertIncludes(
    communityAppMounts,
    "deriveCommunityMountLiveState",
    "community mounts expose live/not-live state",
  );
  assertIncludes(
    userPlatformAppMounts,
    "deriveUserPlatformMountLiveState",
    "personal mounts expose live/not-live state",
  );
  assertIncludes(
    communityAppMounts,
    "return await mountDeveloperAppForCommunity({",
    "community failed setup preserves mount intent",
  );
  assertNotIncludes(
    communityAppMounts,
    "export const reconnectCommunityApp = action({",
    "community app records do not own credential reconnect lifecycle",
  );
  assertNotIncludes(
    communityAppMounts,
    "encryptSecret(",
    "community app records do not store shared secrets",
  );
  assertNotIncludes(
    communityAppMountTypes,
    "secret?: string;",
    "community connect input has no secret field",
  );
  assertNotIncludes(
    cloudCommunityAppMountGateway,
    "community:reconnectCommunityApp",
    "cloud gateway exposes no community reconnect action",
  );
  assertNotIncludes(
    appEditor,
    "Save secret",
    "community app editor has no shared secret reconnect UI",
  );
  assertIncludes(
    userPlatformAppMounts,
    "mountSetupNeededDeveloperAppForUser({",
    "personal failed setup preserves mount intent",
  );
  assertIncludes(
    schema,
    "userPlatformAppMountSources: defineTable({",
    "user harness app provenance is durable",
  );
  assertIncludes(
    schema,
    ".index(\"by_user_sourceKey\", [\"userId\", \"sourceKey\"])",
    "user harness app source writes are idempotent",
  );
  assertIncludes(
    schema,
    ".index(\"by_community_mount\", [\"communityAppMountId\"])",
    "legacy community app source rows can be promoted on community removal",
  );
  assertIncludes(
    communityAppMounts,
    "seedCommunityAppGrantIntoUserHarnessInternal",
    "community add seeds the builder personal harness",
  );
  assertIncludes(
    communityAppMounts,
    "listCommunityAppGrantSeedSourcesInternal",
    "community app records can be listed for member bulk seeding",
  );
  assertIncludes(
    communityAppMounts,
    "listCommunityAppGrantRecipientUserIdsInternal",
    "community app existing-member recipients are derived from community membership",
  );
  assertIncludes(
    communityAppMounts,
    "seedCommunityAppGrantForExistingMembersInternal",
    "community add schedules existing-member app seeding",
  );
  assertIncludes(
    userPlatformAppMounts,
    "export const ensureUserHarnessAppInternal = internalAction({",
    "canonical user harness app ensure path",
  );
  assertIncludes(
    userPlatformAppMounts,
    "findExistingUserPlatformMountByIdentityInternal",
    "community app seeding reuses existing personal app identity",
  );
  assertIncludes(
    communityAppMounts,
    "findExistingCommunityAppMountByIdentityInternal",
    "community app add reuses an existing community app identity",
  );
  assertIncludes(
    communityAppMounts,
    "normalizeDeveloperAppEndpointUrl(args.endpointUrl)",
    "community app add uses normalized endpoint fallback identity",
  );
  assertIncludes(
    userPlatformAppMounts,
    "throw new Error(\"community_app_mount_source_required\")",
    "legacy community source provenance fails closed when missing source ids",
  );
  assertIncludes(
    userPlatformAppMounts,
    "upsertUserPlatformAppMountSourceInternal",
    "canonical ensure path records provenance",
  );
  assertIncludes(
    userPlatformAppMounts,
    "source: args.source ?? { sourceType: \"personal\" }",
    "personal connects record personal source provenance",
  );
  assertIncludes(
    userPlatformAppMounts,
    "sourceType: \"personal\"",
    "community distribution installs record user-owned app provenance",
  );
  assertIncludes(
    userPlatformAppMounts,
    "export const seedCommunityAppGrantsForUserInternal = internalAction({",
    "community join bulk-add has canonical scheduled seeding action",
  );
  assertIncludes(
    userPlatformAppMounts,
    "export const seedCommunityAppGrantForExistingMembersInternal = internalAction({",
    "community add fan-out has canonical scheduled seeding action",
  );
  assertIncludes(
    userPlatformAppMounts,
    "export const promoteCommunityAppGrantSourcesToPersonalInternal = internalMutation({",
    "community removal promotes legacy community-sourced installs to user ownership",
  );
  assertIncludes(
    userPlatformAppMounts,
    "promoted_personal_source_count",
    "community removal never deletes existing user harness apps",
  );
  assertIncludes(
    communityAppMounts,
    "promoteCommunityAppGrantSourcesToPersonalInternal",
    "community app removal preserves existing user harness apps before deleting the community app record",
  );
  assertNotIncludes(
    communityAppMounts,
    "personal_harness_cleanup",
    "community app removal is no longer an uninstall path for user harness apps",
  );
  for (const [source, label] of [
    [communityPublic, "public/free community join"],
    [communityAdmin, "join request approval"],
    [billingCore, "paid checkout membership ensure"],
    [platformHomeCommunity, "platform home autojoin"],
  ] as const) {
    assertIncludes(
      source,
      "seedCommunityAppGrantsForUserInternal",
      `${label} schedules community app seeding`,
    );
    assertIncludes(
      source,
      "ctx.scheduler.runAfter",
      `${label} seeds community apps asynchronously`,
    );
  }
  assertIncludes(
    communityAppMounts,
    "if (!app) continue;",
    "community list keeps snapshotless setup-needed mounts",
  );
  assertIncludes(
    userPlatformAppMounts,
    "if (!app) continue;",
    "personal list keeps snapshotless setup-needed mounts",
  );
  assertIncludes(
    userPlatformAppMounts,
    "if (!app || !snapshot) continue;",
    "personal runtime skips non-live snapshotless mounts",
  );
  assertIncludes(
    communityAppMounts,
    "assertCommunityManagerAccessInternal",
    "manager-only community app mutation guard",
  );
  assertNotIncludes(
    communityAppMounts,
    "listRuntimeCommunityMountedToolsInternal",
    "community app records must not expose runtime MCP tools",
  );

  assertNotIncludes(
    httpDaytona,
    "internal.communityAppMounts.listRuntimeCommunityMountedToolsInternal",
    "runtime mounted-tool resolution",
  );
  assertIncludes(
    httpDaytona,
    "createPolyNetExecutionSession({",
    "runtime personal mounted-tool execution session composition",
  );
  assertIncludes(
    httpDaytona,
    "executionSession.executeMountedTool({",
    "runtime personal mounted-tool execution dispatch",
  );
  assertNotIncludes(
    httpDaytona,
    "community_app_tools_resolved",
    "runtime mounted-tool evidence event",
  );
  assertNotIncludes(
    httpDaytona,
    "mountedTool.scope === \"community\" && mountedTool.risk_level !== \"read\"",
    "community mounted write/sensitive runtime guard",
  );
  assertIncludes(
    runtimeExecutionSession,
    "createRuntimeMcpManager({",
    "execution session owns MCP manager",
  );
  assertIncludes(
    runtimeExecutionSession,
    "async executeMountedTool(params:",
    "execution session exposes mounted tool execution",
  );
  assertIncludes(
    runtimeMcpManager,
    "callTool:",
    "runtime MCP manager calls remote mounted tools",
  );
  assertIncludes(
    webDiscoverPanel,
    "communityConnectRequirements = personalConnectRequirements.filter",
    "community add hides personal secret requirements",
  );
  assertIncludes(
    webDiscoverPanel,
    "secret: undefined",
    "community add does not submit personal secrets",
  );
  assertIncludes(
    appShell,
    "loadUserPlatformAppMounts(session)",
    "community add reloads personal harness mounts after seeding",
  );
  assertIncludes(
    communityAppsController,
    "communityAppMountsLoadRequestIdRef",
    "community app mount loads are request-token guarded",
  );
  assertIncludes(
    communityAppsController,
    "latest.activeCommunityId === communityId",
    "community app mount controller checks the active community before state commits",
  );
  assertIncludes(
    communityAppsController,
    "latest.session?.user.id === usableSession.user.id",
    "community app mount controller checks the active session before state commits",
  );

  assertIncludes(appEditor, "Refresh", "apps editor refresh control");

  console.log("community_app_lifecycle_contract_proof: ok");
}

main();
