import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { composeResolvedRuntimeHarness } from "../convex/runtimeHarnessComposition.ts";
import { normalizeRuntimeSkillResolution } from "../convex/runtimeHarnessShaping.ts";
import { buildEffectiveSkills } from "../shared/effectiveSkills.ts";
import {
  COMMUNITY_MANAGER_PLATFORM_SKILLS,
  GLOBAL_PLATFORM_SKILLS,
  PLATFORM_RESOURCES_ARCHITECT_SKILL,
} from "../shared/platformSkills.ts";
import {
  extractExplicitSkillMentions,
  resolveScopedExplicitlyMentionedSkills,
} from "../shared/runtimeSkillActivation.ts";
import {
  DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS,
  buildBoundedSkillInventoryPrompt,
} from "../shared/runtimeSkillInventoryPrompt.ts";
import { buildRuntimeContextManifest } from "../shared/runtimeContextManifest.ts";
import { buildPlatformHarnessRuntimePromptBundle } from "../shared/runtimePrompt.ts";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const contract = read("docs/skill-harness-contract.md");
const runtimeSkillResolution = read("convex/runtimeSkillResolution.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const runtimeHarnessComposition = read("convex/runtimeHarnessComposition.ts");

for (const marker of [
  "Skills separate availability from activation.",
  "explicit_mention",
  "platform_required",
  "skillPackages",
  "skillPackageRevisions",
  "userPlatformSkillInstalls",
  "communitySkillAttachments",
  "activation_route",
  "activation_reason",
  "human-inspectable context receipts",
  "all-skill injection",
]) {
  assert.ok(contract.includes(marker), `skill harness contract missing ${marker}`);
}
assert.doesNotMatch(contract, /platform:onboarding-guide|\$onboarding-guide|onboarding_completed/);

const inventoryPrompt = buildBoundedSkillInventoryPrompt({
  heading: "TEST_SKILL_CONTEXT",
  introLines: ["Use compact inventory to route skill behavior."],
  budgetChars: 320,
  skills: Array.from({ length: 16 }, (_, index) => ({
    name: `Workflow ${index}`,
    mentionToken: `workflow-${index}`,
    description: "A bounded workflow description that should be compacted.",
  })),
});
assert.ok(inventoryPrompt.text.length <= 320);
assert.equal(inventoryPrompt.report.usedChars, inventoryPrompt.text.length);
assert.ok(
  DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS >=
    inventoryPrompt.text.length,
);

assert.deepEqual(
  extractExplicitSkillMentions([
    { role: "user", content: "Use $weekly-research and $launch." },
  ]),
  ["weekly-research", "launch"],
);
const explicitResolution = resolveScopedExplicitlyMentionedSkills(
  [
    {
      scope: "personal" as const,
      mentionToken: "weekly-research",
      value: { id: "personal-weekly" },
    },
    {
      scope: "community" as const,
      mentionToken: "launch",
      value: { id: "community-launch" },
    },
  ],
  ["weekly-research", "launch"],
);
assert.equal(explicitResolution.selected.length, 2);
assert.deepEqual(explicitResolution.ambiguousMentionTokens, []);

const projected = buildEffectiveSkills({
  platformSkills: COMMUNITY_MANAGER_PLATFORM_SKILLS,
  personalSkills: [
    {
      id: "personal-install",
      enabled: true,
      skill: {
        id: "personal-skill",
        name: "Resources Architect",
        mentionToken: "resources-architect",
        description: "Personal duplicate",
        catalogSkillId: null,
        instructionsMd: "Personal instructions.",
      },
    },
  ],
  communitySkills: [
    {
      id: "community-attachment",
      enabled: true,
      skill: {
        id: "community-skill",
        name: "Resources Architect",
        mentionToken: "resources-architect",
        description: "Community duplicate",
        catalogSkillId: null,
      },
    },
  ],
});
assert.equal(projected.length, 1);
assert.equal(projected[0]?.scope, "platform");
assert.equal(projected[0]?.platform_skill?.id, PLATFORM_RESOURCES_ARCHITECT_SKILL.id);
assert.equal(projected[0]?.personal_install?.id, "personal-install");
assert.equal(projected[0]?.community_attachment?.id, "community-attachment");
assert.deepEqual(GLOBAL_PLATFORM_SKILLS, []);

const normalized = normalizeRuntimeSkillResolution({
  requested_mention_tokens: ["resources-architect"],
  ambiguous_mention_tokens: [],
  community_resource_lane: {
    lane: "builder",
    can_read_live_resources: true,
    can_use_resource_builder: true,
  },
  platform_skill_inventory: [],
  selected_platform_skills: [
    {
      platform_skill_id: PLATFORM_RESOURCES_ARCHITECT_SKILL.id,
      catalog_skill_id: PLATFORM_RESOURCES_ARCHITECT_SKILL.catalogSkillId,
      name: PLATFORM_RESOURCES_ARCHITECT_SKILL.name,
      mention_token: PLATFORM_RESOURCES_ARCHITECT_SKILL.mentionToken,
      instructions_md: "Inspect before editing.",
      activation_route: "platform_required",
      activation_reason: "active builder resource lane",
    },
  ],
  user_platform_skill_inventory: [],
  selected_user_platform_skills: [],
  community_skill_inventory: [],
  selected_community_skills: [],
});
const harness = composeResolvedRuntimeHarness({
  skillResolution: normalized,
});
const compiledHarnessSuffix = harness.promptExtensions
  .map((section) => String(section.text ?? ""))
  .join("");
assert.match(
  compiledHarnessSuffix,
  /PLATFORM_SKILL_PACKAGE: Resources Architect \(\$resources-architect\)/,
);
assert.deepEqual(harness.promptExtensions.map((section) => section.id), [
  "platform_skill_overlay",
  "personal_skill_overlay",
  "ambiguous_skill_mentions",
  "community_skill_overlay",
]);
const promptParams = {
  loopBudget: { maxToolSteps: 2, maxRepeatedIdenticalCalls: 1, maxConsecutiveFailures: 1, maxNoProgressSteps: 1 },
  allowedToolNames: ["polynet_list", "polynet_read", "polynet_search", "polynet_write", "polynet_call"] as const,
  harnessName: "chat_tools" as const,
  invocationSurface: "member_agent_dock" as const,
  runtimeTurnContext: buildRuntimeTurnContextPacket({}),
};
const basePromptBundle = buildPlatformHarnessRuntimePromptBundle(promptParams);
const promptBundle = buildPlatformHarnessRuntimePromptBundle({
  ...promptParams,
  promptExtensions: harness.promptExtensions,
});
assert.equal(promptBundle.text, basePromptBundle.text + compiledHarnessSuffix);

const manifest = buildRuntimeContextManifest({
  promptSections: promptBundle.sections,
  allowedToolNames: [
    "polynet_list",
    "polynet_read",
    "polynet_search",
    "polynet_write",
    "polynet_call",
  ],
});
const selectedPrompt = manifest.prompts.find(
  (prompt) => prompt.id === "platform_skill_overlay",
);
assert.equal(selectedPrompt?.authority, "platform_policy");

assert.match(runtimeSkillResolution, /GLOBAL_PLATFORM_RUNTIME_SKILLS/);
assert.match(runtimeSkillResolution, /activation_route: "platform_required"/);
assert.match(runtimeSkillResolution, /activation_route: "explicit_mention"/);
assert.doesNotMatch(
  runtimeSkillResolution,
  /lifecycleTrigger|lifecycle_trigger|onboarding_completed|onboarding-guide/,
);
assert.doesNotMatch(runtimeAgentLoop, /buildEffectiveAllowedToolNames/);
assert.doesNotMatch(runtimeAgentLoop, /buildPlatformSkillToolNamesForSelection/);
assert.match(runtimeAgentLoop, /buildRuntimeContextManifest/);
assert.match(runtimeAgentLoop, /activation_route: selected\?\.activation_route \?\? null/);
assert.match(runtimeAgentLoop, /activation_reason: selected\?\.activation_reason \?\? null/);
assert.doesNotMatch(
  runtimeAgentLoop,
  /skillLifecycleTrigger|privateLifecycleContext|onboarding_required_tool/,
);
assert.match(
  runtimeHarnessComposition,
  /DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS/,
);

console.log("skill_harness_contract_proof: ok");
