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
  const communityAgentDock = readText(
    join(root, "apps/web/src/components/WebCommunityAgentDock.tsx"),
  );
  const runtimeHarnessComposition = readText(
    join(root, "convex/runtimeHarnessComposition.ts"),
  );
  const runtimePrompt = readText(join(root, "shared/runtimePrompt.ts"));
  const lens = readText(join(root, "shared/lens.ts"));
  const communityAgent = readText(join(root, "convex/communityAgent.ts"));

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
    'LENS_FAMILY[params.communityLens.lens] === "builder" ? "builder" : "member"',
    "the resources lane follows the talk's lens",
  );
  assertIncludes(
    communityAgent,
    'throw new Error("community_entitlement_required")',
    "the talk's lens fails closed without community entry",
  );
  assertIncludes(
    communityAgent,
    'resolveLens({ principalKind: "community_agent_for_member", evidenceSurface: "member_agent_dock", authority })',
    "the talk's lens comes from the executor's own authority",
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
  assertIncludes(lens, "export type TalkLens = {", "the private talk's lens type");
  assertIncludes(lens, 'const RELATIONS = new Set(["owner", "admin", "moderator", "member"]);', "a talk's relation is never pending or visitor");
  assertIncludes(
    runtimePrompt,
    "community_lens_authority",
    "runtime prompt includes community authority receipt section",
  );
  assertIncludes(
    runtimeTurnResolution,
    "runtimeCommunityLens = parseTalkLens(",
    "runtime resolver returns the talk's lens",
  );
  assertIncludes(
    runtimeTurnHandlers,
    "communityLens: runtimeCommunityLens",
    "runtime handlers pass the talk's lens into harnesses",
  );

  console.log("community_lens_runtime_contract_proof: ok");
}

main();
