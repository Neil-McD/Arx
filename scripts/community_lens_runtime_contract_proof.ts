import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function main() {
  const httpDaytona = readText(
    "/Users/neilmcdevitt/code/arx/convex/httpDaytona.ts",
  );
  const threads = readText(
    "/Users/neilmcdevitt/code/arx/convex/threads.ts",
  );
  const runtimeTurnResolution = readText(
    "/Users/neilmcdevitt/code/arx/convex/runtimeTurnResolution.ts",
  );
  const runtimeTurnHandlers = readText(
    "/Users/neilmcdevitt/code/arx/convex/runtimeTurnHandlers.ts",
  );
  const app = readText(
    "/Users/neilmcdevitt/code/arx/apps/web/src/App.tsx",
  );
  const runtimeSkillResolution = readText(
    "/Users/neilmcdevitt/code/arx/convex/runtimeSkillResolution.ts",
  );
  const runtimeHarnessComposition = readText(
    "/Users/neilmcdevitt/code/arx/convex/runtimeHarnessComposition.ts",
  );

  assertIncludes(
    httpDaytona,
    "internal.communityAppMounts.listRuntimeCommunityMountedToolsInternal",
    "community-lens mounted app query",
  );
  assertIncludes(
    httpDaytona,
    "internal.runtimeSkillResolution.resolveRuntimeSkillSelectionInternal",
    "community-lens shared skill resolution query",
  );
  assertIncludes(
    runtimeHarnessComposition,
    "buildAmbiguousSkillMentionsPromptBlock",
    "community-lens ambiguity handling prompt block",
  );
  assertIncludes(
    runtimeHarnessComposition,
    "buildCommunityOverlayRuntimeState({",
    "shared overlay runtime composition helper",
  );
  assertIncludes(
    httpDaytona,
    "composeResolvedRuntimeHarness({",
    "community-lens effective harness composer",
  );
  assertIncludes(
    httpDaytona,
    "mountedToolDiscoveryCatalog: resolvedHarness.discoveryMountedTools",
    "community-lens effective mounted tool discovery projection",
  );
  assertIncludes(
    httpDaytona,
    "community_app_tools_resolved",
    "runtime evidence for mounted app overlays",
  );
  assertIncludes(
    httpDaytona,
    "community_skills_resolved",
    "runtime evidence for skill overlays",
  );
  assertIncludes(
    runtimeSkillResolution,
    "filterUserSkillScopeAgainstCommunity({",
    "community-lens personal skill shadowing helper",
  );
  assertIncludes(
    runtimeSkillResolution,
    "...userPlatformSkillScope.selectedCandidates",
    "community-lens personal skill candidates remain available when unique",
  );
  assertIncludes(
    runtimeSkillResolution,
    "...communitySelectedCandidates",
    "community-lens community skill candidates remain active",
  );
  assertIncludes(
    httpDaytona,
    "effective_harness_resolved",
    "community-lens effective harness evidence event",
  );
  assertIncludes(
    threads,
    "validateThreadCommunityLensAccess",
    "thread lens write authority helper",
  );
  assertIncludes(
    threads,
    "await requireCommunityChatAccess({",
    "thread lens writes validate community access",
  );
  assertIncludes(
    runtimeTurnResolution,
    "community_lens_unavailable",
    "runtime community lens fails closed",
  );
  assertIncludes(
    runtimeTurnHandlers,
    "runtime_context_resolved",
    "runtime lens audit event",
  );
  assertIncludes(
    runtimeTurnHandlers,
    "communityContextVersion",
    "runtime run snapshots community context version",
  );
  assertIncludes(
    app,
    "Community context was not confirmed.",
    "workspace lens switch requires confirmed server state",
  );

  console.log("community_lens_runtime_contract_proof: ok");
}

main();
