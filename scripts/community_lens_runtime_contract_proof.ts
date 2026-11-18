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
    runtimePrompt,
    "const skills = guideSkillsFor(params.allowedToolNames);",
    "course-building instructions are a skill offered only with the course tools",
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
    "COMMUNITY_ABOUT_PROMPT_EXCERPT_CHARS",
    "the community's own words in the prompt stay compact",
  );
  assertIncludes(
    runtimePrompt,
    "In its own words, in short; community.md has it in full.",
    "the prompt distinguishes the identity excerpt from the full community document",
  );
  assertIncludes(lens, "export type TalkLens = {", "the private talk's lens type");
  assertIncludes(lens, 'const RELATIONS = new Set(["owner", "admin", "moderator", "member"]);', "a talk's relation is never pending or visitor");
  assertIncludes(
    runtimePrompt,
    '"what_you_may_do"',
    "runtime prompt receipts what this role may do as its own section",
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
