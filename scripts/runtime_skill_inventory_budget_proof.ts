import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { composeResolvedRuntimeHarness } from "../convex/runtimeHarnessComposition.ts";
import {
  DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS,
  buildBoundedSkillInventoryPrompt,
} from "../shared/runtimeSkillInventoryPrompt.ts";
import {
  buildCommunityOverlayRuntimeState,
  type CommunityOverlaySelectedSkill,
  type CommunityOverlaySkillInventory,
} from "../shared/communityOverlayRuntime.ts";
import {
  buildPersonalSkillOverlayRuntimeState,
  type PersonalOverlaySelectedSkill,
  type PersonalOverlaySkillInventory,
} from "../shared/personalSkillOverlayRuntime.ts";
import {
  buildPlatformSkillOverlayRuntimeState,
  type PlatformOverlaySelectedSkill,
  type PlatformOverlaySkillInventory,
} from "../shared/platformSkillOverlayRuntime.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function promptCharLength(value: string): number {
  return Array.from(value).length;
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(
    haystack.includes(needle),
    `expected ${label} to include ${needle}`,
  );
}

function assertExcludes(haystack: string, needle: string, label: string) {
  assert.ok(
    !haystack.includes(needle),
    `expected ${label} to exclude ${needle}`,
  );
}

function proveOverlaySourcesUseSharedRenderer() {
  for (const path of [
    "shared/platformSkillOverlayRuntime.ts",
    "shared/personalSkillOverlayRuntime.ts",
    "shared/communityOverlayRuntime.ts",
  ]) {
    const source = readText(path);
    assertIncludes(
      source,
      "buildBoundedSkillInventoryPrompt",
      `${path} shared bounded skill inventory renderer`,
    );
    assertExcludes(source, ".slice(0, 12)", `${path} old fixed skill cap`);
  }
  console.log("PASS: overlay prompt blocks use the shared bounded renderer");
}

function proveDescriptionsTruncateBeforeOmission() {
  const result = buildBoundedSkillInventoryPrompt({
    heading: "TEST_SKILL_CONTEXT",
    introLines: ["Use this compact inventory to route skill behavior."],
    budgetChars: 260,
    skills: [
      {
        name: "Alpha Skill",
        mentionToken: "alpha-skill",
        description: "alpha detail ".repeat(60),
      },
      {
        name: "Beta Skill",
        mentionToken: "beta-skill",
        description: "beta detail ".repeat(60),
      },
    ],
  });

  assert.ok(
    promptCharLength(result.text) <= 260,
    "expected bounded skill prompt to stay within the supplied budget",
  );
  assert.equal(
    result.report.omittedCount,
    0,
    "expected all skills to remain visible before omitting any",
  );
  assert.ok(
    result.report.truncatedDescriptionCount > 0,
    "expected descriptions to be truncated when full lines exceed budget",
  );
  assertIncludes(
    result.text,
    "$alpha-skill: Alpha Skill",
    "truncated alpha skill identity",
  );
  assertIncludes(
    result.text,
    "$beta-skill: Beta Skill",
    "truncated beta skill identity",
  );
  assertIncludes(
    result.text,
    "Some available skill descriptions were shortened",
    "description truncation note",
  );
  console.log("PASS: skill descriptions truncate before skills are omitted");
}

function proveSkillsOmitOnlyAfterMinimumIdentityCannotFit() {
  const result = buildBoundedSkillInventoryPrompt({
    heading: "TEST_SKILL_CONTEXT",
    introLines: ["Use this compact inventory to route skill behavior."],
    budgetChars: 220,
    skills: Array.from({ length: 30 }, (_, index) => ({
      name: `Skill ${index}`,
      mentionToken: `skill-${index}`,
      description: `Detailed routing description for skill ${index}.`,
    })),
  });

  assert.ok(
    promptCharLength(result.text) <= 220,
    "expected omitted skill prompt to stay within the supplied budget",
  );
  assert.ok(
    result.report.includedCount > 0,
    "expected minimum identity lines to be kept while budget allows",
  );
  assert.ok(
    result.report.omittedCount > 0,
    "expected excess skills to be omitted only after minimum identity budget is exhausted",
  );
  assertIncludes(
    result.text,
    "Some available skills were omitted from this bounded skills list.",
    "omitted skills note",
  );
  console.log(
    "PASS: excess skill inventory omits only after minimum identities",
  );
}

function proveOverlayInventoriesStayBounded() {
  const installedSkills: PersonalOverlaySkillInventory[] = Array.from(
    { length: 400 },
    (_, index) => ({
      name: `Skill ${index}`,
      mentionToken: `skill-${index}`,
      description: "Long routing description. ".repeat(20),
    }),
  );
  const state = buildPersonalSkillOverlayRuntimeState({
    installedSkills,
    selectedSkills: [],
  });
  assert.ok(
    promptCharLength(state.systemPromptSuffix) <=
      DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS,
    "expected default personal skill inventory prompt to stay within the Codex-style fallback budget",
  );
  console.log("PASS: overlay skill inventories are bounded by default");
}

function proveComposedHarnessUsesOneGlobalSkillInventoryBudget() {
  const platformSkills = Array.from({ length: 500 }, (_, index) => ({
    platform_skill_id: `platform:skill-${index}`,
    catalog_skill_id: `platform-skill-${index}`,
    name: `Platform Skill ${index}`,
    mention_token: `platform-skill-${index}`,
    description: "Long platform routing description. ".repeat(50),
    requires_capability: "community_resources_manage",
  }));
  const personalSkills = Array.from({ length: 500 }, (_, index) => ({
    user_platform_skill_install_id: `personal-install-${index}`,
    skill_package_id: `personal-skill-${index}`,
    catalog_skill_id: `personal-skill-${index}`,
    name: `Personal Skill ${index}`,
    mention_token: `personal-skill-${index}`,
    description: "Long personal routing description. ".repeat(50),
  }));
  const communitySkills = Array.from({ length: 500 }, (_, index) => ({
    community_skill_attachment_id: `community-attachment-${index}`,
    skill_package_id: `community-skill-${index}`,
    catalog_skill_id: `community-skill-${index}`,
    name: `Community Skill ${index}`,
    mention_token: `community-skill-${index}`,
    description: "Long community routing description. ".repeat(50),
  }));

  const resolved = composeResolvedRuntimeHarness({
    personalMountedTools: [],
    skillResolution: {
      requested_mention_tokens: [],
      ambiguous_mention_tokens: [],
      community_resource_lane: {
        lane: "builder",
        can_read_live_resources: true,
        can_use_resource_builder: true,
      },
      platform_skill_inventory: platformSkills,
      selected_platform_skills: [],
      user_platform_skill_inventory: personalSkills,
      selected_user_platform_skills: [],
      community_skill_inventory: communitySkills,
      selected_community_skills: [],
    },
  });

  assert.ok(
    promptCharLength(resolved.systemPromptSuffix) <=
      DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS,
    "expected composed platform/community/personal skill inventory to share one global budget",
  );
  assertIncludes(
    resolved.systemPromptSuffix,
    "PLATFORM_WORKFLOW_CONTEXT",
    "global skill budget priority keeps platform inventory first",
  );
  console.log("PASS: composed harness skill inventory uses one global budget");
}

function proveSelectedPayloadsRemainPayloadOnDemand() {
  const platformSkill: PlatformOverlaySelectedSkill = {
    name: "Resources Architect",
    mentionToken: "resources-architect",
    description: "Organize resources.",
    instructionsMd: "PRIVATE_PLATFORM_SKILL_INSTRUCTIONS",
  };
  const platformState = buildPlatformSkillOverlayRuntimeState({
    skills: [platformSkill],
    selectedSkills: [platformSkill],
  });
  assertIncludes(
    platformState.systemPromptSuffix,
    "PLATFORM_SKILL_PACKAGE: Resources Architect ($resources-architect)",
    "selected platform skill package header",
  );
  assertIncludes(
    platformState.systemPromptSuffix,
    "PRIVATE_PLATFORM_SKILL_INSTRUCTIONS",
    "selected platform skill payload",
  );

  const personalSkill: PersonalOverlaySkillInventory = {
    name: "Weekly Research",
    mentionToken: "weekly-research",
    description: "Prepare recurring research.",
  };
  const unselectedPersonalState = buildPersonalSkillOverlayRuntimeState({
    installedSkills: [personalSkill],
    selectedSkills: [],
  });
  assertExcludes(
    unselectedPersonalState.systemPromptSuffix,
    "PERSONAL_SKILL_PACKAGE",
    "unselected personal skill package payload",
  );
  assertExcludes(
    unselectedPersonalState.systemPromptSuffix,
    "PRIVATE_PERSONAL_SKILL_INSTRUCTIONS",
    "unselected personal skill private payload",
  );

  const selectedPersonalSkill: PersonalOverlaySelectedSkill = {
    ...personalSkill,
    instructionsMd: "PRIVATE_PERSONAL_SKILL_INSTRUCTIONS",
  };
  const selectedPersonalState = buildPersonalSkillOverlayRuntimeState({
    installedSkills: [personalSkill],
    selectedSkills: [selectedPersonalSkill],
  });
  assertIncludes(
    selectedPersonalState.systemPromptSuffix,
    "PERSONAL_SKILL_PACKAGE: Weekly Research ($weekly-research)",
    "selected personal skill package header",
  );
  assertIncludes(
    selectedPersonalState.systemPromptSuffix,
    "PRIVATE_PERSONAL_SKILL_INSTRUCTIONS",
    "selected personal skill payload",
  );

  const communitySkill: CommunityOverlaySelectedSkill = {
    name: "Board Summary",
    mentionToken: "board-summary",
    description: "Summarize board material.",
    instructionsMd: "PRIVATE_COMMUNITY_SKILL_INSTRUCTIONS",
  };
  const communityState = buildCommunityOverlayRuntimeState({
    attachedSkills: [communitySkill],
    selectedSkills: [communitySkill],
  });
  assertIncludes(
    communityState.systemPromptSuffix,
    "COMMUNITY_SKILL_PACKAGE: Board Summary ($board-summary)",
    "selected community skill package header",
  );
  assertIncludes(
    communityState.systemPromptSuffix,
    "PRIVATE_COMMUNITY_SKILL_INSTRUCTIONS",
    "selected community skill payload",
  );
  console.log("PASS: selected skill payloads remain payload-on-demand");
}

function main() {
  proveOverlaySourcesUseSharedRenderer();
  proveDescriptionsTruncateBeforeOmission();
  proveSkillsOmitOnlyAfterMinimumIdentityCannotFit();
  proveOverlayInventoriesStayBounded();
  proveComposedHarnessUsesOneGlobalSkillInventoryBudget();
  proveSelectedPayloadsRemainPayloadOnDemand();
  console.log("PASS: runtime skill inventory budget contract holds.");
}

main();
