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
  const runtimeAgentLoop = readText(join(root, "convex/runtimeAgentLoop.ts"));
  const threads = readText(join(root, "convex/threads.ts"));
  const runtimeTurnResolution = readText(
    join(root, "convex/runtimeTurnResolution.ts"),
  );
  const runtimeTurnHandlers = readText(
    join(root, "convex/runtimeTurnHandlers.ts"),
  );
  const memberAgentDock = readText(
    join(root, "apps/web/src/components/WebMemberAgentDock.tsx"),
  );
  const runtimeCommunityResourceLane = readText(
    join(root, "convex/runtimeCommunityResourceLane.ts"),
  );
  const runtimeHarnessComposition = readText(
    join(root, "convex/runtimeHarnessComposition.ts"),
  );
  const runtimePrompt = readText(join(root, "shared/runtimePrompt.ts"));
  const communityLensAuthority = readText(
    join(root, "shared/communityLensAuthority.ts"),
  );

  assertNotIncludes(
    runtimeAgentLoop,
    "internal.communityAppMounts.listRuntimeCommunityMountedToolsInternal",
    "community-lens runtime app query",
  );
  assertNotIncludes(
    runtimeAgentLoop,
    "community_app_tools_resolved",
    "runtime evidence for community app overlays",
  );
  assertIncludes(
    runtimeAgentLoop,
    "internal.runtimeCommunityResourceLane.resolveRuntimeCommunityResourceLaneInternal",
    "community-lens resource lane query",
  );
  assertIncludes(
    runtimeCommunityResourceLane,
    'throw new Error("community_entitlement_required")',
    "community-lens resource lane fails closed without community entry",
  );
  assertIncludes(
    runtimeAgentLoop,
    "composeResolvedRuntimeHarness({",
    "community-lens effective harness composer",
  );
  assertIncludes(
    runtimeHarnessComposition,
    "buildResourcesArchitectPromptBlock(",
    "builder-lane resources architect instructions",
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
    runtimePrompt,
    "About excerpt:",
    "community lens prompt keeps about content compact",
  );
  assertIncludes(
    runtimePrompt,
    "The about excerpt is not a complete knowledge base.",
    "community lens prompt distinguishes identity excerpt from retrievable knowledge",
  );
  assertIncludes(
    communityLensAuthority,
    'export type CommunityLensAuthorityRelation =',
    "canonical community lens authority relation type",
  );
  assertNotIncludes(
    communityLensAuthority,
    '"pending"',
    "runtime community lens authority excludes pending users",
  );
  assertNotIncludes(
    communityLensAuthority,
    '"visitor"',
    "runtime community lens authority excludes visitor role",
  );
  assertIncludes(
    runtimePrompt,
    "community_lens_authority",
    "runtime prompt includes community authority receipt section",
  );
  assertIncludes(
    runtimeTurnResolution,
    "runtimeCommunityLensAuthority",
    "runtime resolver returns canonical community lens authority",
  );
  assertIncludes(
    runtimeTurnHandlers,
    "communityLensAuthority: runtimeCommunityLensAuthority",
    "runtime handlers pass community lens authority into harnesses",
  );

  console.log("community_lens_runtime_contract_proof: ok");
}

main();
