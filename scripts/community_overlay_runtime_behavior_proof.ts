import assert from "node:assert/strict";

import {
  buildCommunityOverlayRuntimeState,
  type CommunityOverlayMountedTool,
  type CommunityOverlaySelectedSkill,
  type CommunityOverlaySkillInventory,
} from "../shared/communityOverlayRuntime.ts";

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function assertExcludes(haystack: string, needle: string, label: string) {
  assert.ok(
    !haystack.includes(needle),
    `expected ${label} to exclude ${needle}`,
  );
}

function main() {
  const fixedToolNames = ["community_search", "read"] as const;
  const communityATools: CommunityOverlayMountedTool[] = [
    {
      namespacedToolName: "community_app__github__list_issues",
      toolName: "list_issues",
      appName: "GitHub",
      description: "List issues",
    },
  ];
  const communityASkills: CommunityOverlaySkillInventory[] = [
    {
      name: "Weekly Research",
      mentionToken: "weekly-research",
      description: "Prepare a weekly research synthesis",
    },
  ];
  const communityASelectedSkills: CommunityOverlaySelectedSkill[] = [
    {
      ...communityASkills[0],
      instructionsMd: "Summarize the most important research findings.",
    },
  ];
  const communityAState = buildCommunityOverlayRuntimeState({
    allowedToolNames: fixedToolNames,
    mountedTools: communityATools,
    attachedSkills: communityASkills,
    selectedSkills: communityASelectedSkills,
  });
  assert.deepEqual(
    communityAState.activeToolNames,
    ["community_search", "read", "community_app__github__list_issues"],
    "expected Community A active tools to merge fixed and mounted tool names",
  );
  assertIncludes(
    communityAState.systemPromptSuffix,
    "Community-mounted app tools are available for this active community lens.",
    "Community A app prompt block",
  );
  assertIncludes(
    communityAState.systemPromptSuffix,
    "$weekly-research",
    "Community A skill inventory/injection prompt",
  );
  assertIncludes(
    communityAState.systemPromptSuffix,
    "Summarize the most important research findings.",
    "Community A selected skill instructions",
  );

  const communityBTools: CommunityOverlayMountedTool[] = [
    {
      namespacedToolName: "community_app__calendar__schedule",
      toolName: "schedule",
      appName: "Calendar",
      description: "Schedule events",
    },
  ];
  const communityBSkills: CommunityOverlaySkillInventory[] = [
    {
      name: "Board Summary",
      mentionToken: "board-summary",
      description: "Write concise board summaries",
    },
  ];
  const communityBState = buildCommunityOverlayRuntimeState({
    allowedToolNames: fixedToolNames,
    mountedTools: communityBTools,
    attachedSkills: communityBSkills,
    selectedSkills: [],
  });
  assert.deepEqual(
    communityBState.activeToolNames,
    ["community_search", "read", "community_app__calendar__schedule"],
    "expected Community B active tools to remain isolated from Community A",
  );
  assertIncludes(
    communityBState.systemPromptSuffix,
    "$board-summary",
    "Community B skill inventory prompt",
  );
  assert.ok(
    !communityBState.activeToolNames.includes("community_app__github__list_issues"),
    "expected Community B active tools to exclude Community A mounted tools",
  );
  assertExcludes(
    communityBState.systemPromptSuffix,
    "Summarize the most important research findings.",
    "Community B prompt isolation from Community A selected instructions",
  );

  const noCommunityState = buildCommunityOverlayRuntimeState({
    allowedToolNames: fixedToolNames,
    mountedTools: [],
    attachedSkills: [],
    selectedSkills: [],
  });
  assert.deepEqual(
    noCommunityState.activeToolNames,
    ["community_search", "read"],
    "expected no-community state to preserve only fixed tools",
  );
  assert.equal(
    noCommunityState.systemPromptSuffix,
    "",
    "expected no-community state to inject no overlay prompt suffix",
  );

  console.log("community_overlay_runtime_behavior_proof: ok");
}

main();
