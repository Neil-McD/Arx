import assert from "node:assert/strict";

import {
  buildCommunityOverlayRuntimeState,
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
    attachedSkills: communityASkills,
    selectedSkills: communityASelectedSkills,
  });
  assertIncludes(
    communityAState.systemPromptSuffix,
    "COMMUNITY_WORKFLOW_CONTEXT",
    "Community A workflow context prompt",
  );
  assertIncludes(
    communityAState.systemPromptSuffix,
    "Prefer these community workflows for community-relevant work",
    "Community A priority guidance",
  );
  assertIncludes(
    communityAState.systemPromptSuffix,
    "personal skills remain available",
    "Community A non-exclusive harness guidance",
  );
  assertIncludes(
    communityAState.systemPromptSuffix,
    "Full community skill instructions are injected only when the user explicitly mentions",
    "Community A deterministic activation guidance",
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

  const communityBSkills: CommunityOverlaySkillInventory[] = [
    {
      name: "Board Summary",
      mentionToken: "board-summary",
      description: "Write concise board summaries",
    },
  ];
  const communityBState = buildCommunityOverlayRuntimeState({
    attachedSkills: communityBSkills,
    selectedSkills: [],
  });
  assertIncludes(
    communityBState.systemPromptSuffix,
    "$board-summary",
    "Community B skill inventory prompt",
  );
  assertExcludes(
    communityBState.systemPromptSuffix,
    "Summarize the most important research findings.",
    "Community B prompt isolation from Community A selected instructions",
  );
  assertExcludes(
    communityBState.systemPromptSuffix,
    "community_app__",
    "Community B prompt must not include community MCP tool names",
  );

  const noCommunityState = buildCommunityOverlayRuntimeState({
    attachedSkills: [],
    selectedSkills: [],
  });
  assert.equal(
    noCommunityState.systemPromptSuffix,
    "",
    "expected no-community state to inject no overlay prompt suffix",
  );

  console.log("community_overlay_runtime_behavior_proof: ok");
}

main();
