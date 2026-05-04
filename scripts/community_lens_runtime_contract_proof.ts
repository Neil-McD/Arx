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
  const httpDaytona = readText(join(root, "convex/httpDaytona.ts"));
  const threads = readText(join(root, "convex/threads.ts"));
  const runtimeTurnResolution = readText(
    join(root, "convex/runtimeTurnResolution.ts"),
  );
  const runtimeTurnHandlers = readText(
    join(root, "convex/runtimeTurnHandlers.ts"),
  );
  const app = readText(join(root, "apps/web/src/App.tsx"));
  const runtimeSkillResolution = readText(
    join(root, "convex/runtimeSkillResolution.ts"),
  );
  const runtimeHarnessComposition = readText(
    join(root, "convex/runtimeHarnessComposition.ts"),
  );

  assertNotIncludes(
    httpDaytona,
    "internal.communityAppMounts.listRuntimeCommunityMountedToolsInternal",
    "community-lens runtime app query",
  );
  assertNotIncludes(
    httpDaytona,
    "community_app_tools_resolved",
    "runtime evidence for community app overlays",
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
    "community-lens personal mounted tool discovery projection",
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
