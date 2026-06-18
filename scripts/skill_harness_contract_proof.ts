import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { composeResolvedRuntimeHarness } from "../convex/runtimeHarnessComposition.ts";
import { buildRuntimeLifecyclePlatformSelectedSkills } from "../convex/runtimeSkillResolution.ts";
import { normalizeRuntimeSkillResolution } from "../convex/runtimeHarnessShaping.ts";
import { buildEffectiveSkills } from "../shared/effectiveSkills.ts";
import {
  COMMUNITY_MANAGER_PLATFORM_SKILLS,
  PLATFORM_ONBOARDING_GUIDE_SKILL,
  PLATFORM_RESOURCES_ARCHITECT_SKILL,
  buildPlatformSkillToolNamesForSelection,
} from "../shared/platformSkills.ts";
import {
  extractExplicitSkillMentions,
  normalizeRuntimeSkillActivationRoute,
  resolveScopedExplicitlyMentionedSkills,
} from "../shared/runtimeSkillActivation.ts";
import {
  DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS,
  buildBoundedSkillInventoryPrompt,
} from "../shared/runtimeSkillInventoryPrompt.ts";
import { buildRuntimeContextManifest } from "../shared/runtimeContextManifest.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function assertExcludes(haystack: string, needle: string, label: string) {
  assert.ok(!haystack.includes(needle), `expected ${label} to exclude ${needle}`);
}

function promptCharLength(value: string): number {
  return Array.from(value).length;
}

function proveContractNamesCurrentGroundTruth() {
  const contract = readText("docs/skill-harness-contract.md");
  const requiredNeedles = [
    "Skills separate availability from activation.",
    "explicit_mention",
    "ui_selected",
    "platform_required",
    "lifecycle_trigger",
    "task_match",
    "skillPackages",
    "skillPackageRevisions",
    "userPlatformSkillInstalls",
    "communitySkillAttachments",
    "convex/runtimeSkillResolution.ts",
    "convex/runtimeHarnessComposition.ts",
    "convex/runtimeAgentLoop.ts",
    "shared/runtimeContextManifest.ts",
    "platform:onboarding-guide",
    "activation_route",
    "activation_reason",
    "a separate onboarding prompt stack",
    "human-inspectable context receipts",
    "all-skill injection",
  ];
  for (const needle of requiredNeedles) {
    assertIncludes(contract, needle, "skill harness contract");
  }

  const schema = readText("convex/schema.ts");
  for (const table of [
    "skillPackages: defineTable",
    "skillPackageRevisions: defineTable",
    "userPlatformSkillInstalls: defineTable",
    "communitySkillAttachments: defineTable",
  ]) {
    assertIncludes(schema, table, "current skill schema");
  }
  console.log("PASS: contract names current skill ground truth");
}

function proveBoundedInventoryBeforeSelectedBodies() {
  const result = buildBoundedSkillInventoryPrompt({
    heading: "TEST_SKILL_CONTEXT",
    introLines: ["Use compact inventory to route skill behavior."],
    budgetChars: 320,
    skills: Array.from({ length: 16 }, (_, index) => ({
      name: `Workflow ${index}`,
      mentionToken: `workflow-${index}`,
      description: "Long routing description. ".repeat(30),
    })),
  });

  assert.ok(
    promptCharLength(result.text) <= 320,
    "expected inventory prompt to honor supplied budget",
  );
  assert.ok(
    result.report.includedCount > 0,
    "expected at least some compact skill inventory to remain visible",
  );
  assert.ok(
    result.report.truncatedDescriptionCount > 0 ||
      result.report.omittedCount > 0,
    "expected oversized inventory to be shortened or omitted",
  );

  const resolved = composeResolvedRuntimeHarness({
    personalMountedTools: [],
    skillResolution: {
      requested_mention_tokens: [],
      ambiguous_mention_tokens: [],
      community_resource_lane: {
        lane: "member",
        can_read_live_resources: true,
        can_use_resource_builder: false,
      },
      platform_skill_inventory: [],
      selected_platform_skills: [],
      user_platform_skill_inventory: Array.from({ length: 300 }, (_, index) => ({
        user_platform_skill_install_id: `install-${index}`,
        skill_package_id: `skill-${index}`,
        catalog_skill_id: `skill-${index}`,
        name: `Personal Skill ${index}`,
        mention_token: `personal-skill-${index}`,
        description: "Long personal skill description. ".repeat(40),
      })),
      selected_user_platform_skills: [],
      community_skill_inventory: [],
      selected_community_skills: [],
    },
  });

  assert.ok(
    promptCharLength(resolved.systemPromptSuffix) <=
      DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS,
    "expected unselected skill inventory to stay bounded",
  );
  assertExcludes(
    resolved.systemPromptSuffix,
    "PERSONAL_SKILL_PACKAGE:",
    "unselected personal skill body injection",
  );
  console.log("PASS: inventory is bounded and unselected bodies stay out");
}

function proveExplicitSelectionAndAmbiguitySemantics() {
  assert.deepEqual(
    extractExplicitSkillMentions([
      { role: "user", content: "Please use $weekly-research and $onboarding." },
    ]),
    ["weekly-research", "onboarding"],
  );
  assert.deepEqual(
    extractExplicitSkillMentions([
      { role: "user", content: "No skill token here." },
    ]),
    [],
  );

  const resolvedUnique = resolveScopedExplicitlyMentionedSkills(
    [
      {
        scope: "personal",
        mentionToken: "weekly-research",
        value: { id: "personal-weekly" },
      },
    ],
    ["weekly-research"],
  );
  assert.deepEqual(resolvedUnique.selected, [
    { scope: "personal", value: { id: "personal-weekly" } },
  ]);
  assert.deepEqual(resolvedUnique.ambiguousMentionTokens, []);

  const resolvedAmbiguous = resolveScopedExplicitlyMentionedSkills(
    [
      {
        scope: "personal",
        mentionToken: "weekly-research",
        value: { id: "personal-weekly" },
      },
      {
        scope: "community",
        mentionToken: "weekly-research",
        value: { id: "community-weekly" },
      },
    ],
    ["weekly-research"],
  );
  assert.deepEqual(resolvedAmbiguous.selected, []);
  assert.deepEqual(resolvedAmbiguous.ambiguousMentionTokens, [
    "weekly-research",
  ]);
  console.log("PASS: explicit skill selection fails closed on ambiguity");
}

function proveScopeShadowingAndPlatformToolExpansion() {
  const projected = buildEffectiveSkills({
    platformSkills: COMMUNITY_MANAGER_PLATFORM_SKILLS,
    personalSkills: [
      {
        id: "personal-install",
        enabled: true,
        skill: {
          id: "personal-resources",
          name: "Resources Architect",
          mentionToken: "resources-architect",
          description: "Personal duplicate",
          catalogSkillId: "platform-resources-architect",
          instructionsMd: "Personal duplicate instructions.",
        },
      },
    ],
    communitySkills: [
      {
        id: "community-attachment",
        enabled: true,
        skill: {
          id: "community-resources",
          name: "Resources Architect",
          mentionToken: "resources-architect",
          description: "Community duplicate",
          catalogSkillId: "platform-resources-architect",
        },
      },
    ],
  });

  assert.equal(projected.length, 1);
  assert.equal(projected[0]?.scope, "platform");
  assert.equal(projected[0]?.locked, true);
  assert.equal(projected[0]?.platform_skill?.id, PLATFORM_RESOURCES_ARCHITECT_SKILL.id);
  assert.equal(projected[0]?.personal_install?.id, "personal-install");
  assert.equal(projected[0]?.community_attachment?.id, "community-attachment");

  assert.deepEqual(
    buildPlatformSkillToolNamesForSelection([
      { platform_skill_id: "platform:resources-architect" },
    ]),
    [
      "community_resource_builder_list",
      "community_resource_builder_read",
      "community_resource_builder_stage_changeset",
      "community_resource_builder_apply_changeset",
    ],
  );
  assert.deepEqual(buildPlatformSkillToolNamesForSelection([]), []);
  console.log("PASS: higher-authority skills shadow duplicates and expand platform tools");
}

function proveActivationEvidenceSurvivesRuntimeAndManifest() {
  const normalized = normalizeRuntimeSkillResolution({
    requested_mention_tokens: ["weekly-research"],
    ambiguous_mention_tokens: [],
    community_resource_lane: {
      lane: "builder",
      can_read_live_resources: true,
      can_use_resource_builder: true,
    },
    platform_skill_inventory: [],
    selected_platform_skills: [
      {
        platform_skill_id: "platform:resources-architect",
        catalog_skill_id: "platform-resources-architect",
        name: "Resources Architect",
        mention_token: "resources-architect",
        description: "Organize community Resources.",
        requires_capability: "community_resources_manage",
        instructions_md: "Refactor community Resources from source evidence.",
        activation_route: "platform_required",
        activation_reason:
          "active builder community resource lane requires this platform workflow",
      },
    ],
    user_platform_skill_inventory: [],
    selected_user_platform_skills: [
      {
        user_platform_skill_install_id: "personal-weekly-install",
        skill_package_id: "personal-weekly-skill",
        catalog_skill_id: "weekly-research",
        name: "Weekly Research",
        mention_token: "weekly-research",
        description: "Run a weekly research workflow.",
        skill_revision_id: "weekly-research-revision-1",
        instructions_md: "Research carefully.",
        activation_route: "explicit_mention",
        activation_reason: "user explicitly mentioned $weekly-research",
      },
    ],
    community_skill_inventory: [],
    selected_community_skills: [],
  });

  assert.equal(
    normalized.selected_platform_skills[0]?.activation_route,
    "platform_required",
  );
  assert.equal(
    normalized.selected_user_platform_skills[0]?.activation_route,
    "explicit_mention",
  );
  assert.equal(
    normalizeRuntimeSkillActivationRoute("platform_required"),
    "platform_required",
  );
  assert.equal(normalizeRuntimeSkillActivationRoute("unknown_route"), null);

  const manifest = buildRuntimeContextManifest({
    generatedAt: "2026-06-18T00:00:00.000Z",
    userId: "user",
    threadId: "thread",
    communityId: "community",
    communityContextVersion: 1,
    projectId: null,
    harnessName: "chat_tools",
    inferenceSource: "test",
    latestUserText: "Use $weekly-research.",
    messages: [{ role: "user", content: "Use $weekly-research." }],
    allowedToolNames: [],
    mountedTools: [],
    communityResourceLane: normalized.community_resource_lane,
    selectedPlatformSkills: normalized.selected_platform_skills,
    selectedPersonalSkills: normalized.selected_user_platform_skills,
    selectedCommunitySkills: normalized.selected_community_skills,
  });

  const platformPrompt = manifest.prompts.find(
    (prompt) => prompt.id === "platform_skill:resources-architect",
  );
  const personalPrompt = manifest.prompts.find(
    (prompt) => prompt.id === "personal_skill:weekly-research",
  );
  assert.equal(platformPrompt?.activationRoute, "platform_required");
  assert.equal(
    platformPrompt?.activationReason,
    "active builder community resource lane requires this platform workflow",
  );
  assert.equal(personalPrompt?.activationRoute, "explicit_mention");
  assert.equal(
    personalPrompt?.activationReason,
    "user explicitly mentioned $weekly-research",
  );

  const legacyNormalized = normalizeRuntimeSkillResolution({
    selected_platform_skills: [
      {
        platform_skill_id: "platform:legacy",
        name: "Legacy Platform",
        mention_token: "legacy",
        instructions_md: "Legacy selected body.",
      },
    ],
  });
  assert.equal(legacyNormalized.selected_platform_skills[0]?.activation_route, null);
  assert.equal(
    legacyNormalized.selected_platform_skills[0]?.activation_reason,
    null,
  );
  console.log("PASS: selected skill activation evidence reaches manifest");
}

function proveLifecycleOnboardingActivationUsesSkillHarnessPath() {
  assert.equal(PLATFORM_ONBOARDING_GUIDE_SKILL.requiresCapability, null);
  assert.equal(
    buildRuntimeLifecyclePlatformSelectedSkills(null).length,
    0,
    "no lifecycle trigger should mean no onboarding body",
  );

  const lifecycleSelectedSkills = buildRuntimeLifecyclePlatformSelectedSkills(
    "onboarding_completed",
  );
  assert.equal(lifecycleSelectedSkills.length, 1);
  assert.equal(
    lifecycleSelectedSkills[0]?.platform_skill_id,
    "platform:onboarding-guide",
  );
  assert.equal(
    lifecycleSelectedSkills[0]?.activation_route,
    "lifecycle_trigger",
  );
  assert.equal(
    lifecycleSelectedSkills[0]?.activation_reason,
    "account onboarding completed",
  );

  const resolved = composeResolvedRuntimeHarness({
    personalMountedTools: [],
    skillResolution: {
      requested_mention_tokens: [],
      ambiguous_mention_tokens: [],
      community_resource_lane: {
        lane: "none",
        can_read_live_resources: false,
        can_use_resource_builder: false,
      },
      platform_skill_inventory: [],
      selected_platform_skills: lifecycleSelectedSkills,
      user_platform_skill_inventory: [],
      selected_user_platform_skills: [],
      community_skill_inventory: [],
      selected_community_skills: [],
    },
  });
  assertIncludes(
    resolved.systemPromptSuffix,
    "PLATFORM_SKILL_PACKAGE: Onboarding Guide ($onboarding-guide)",
    "lifecycle-selected onboarding instructions",
  );
  assertExcludes(
    resolved.systemPromptSuffix,
    "community_resource_builder_apply_changeset",
    "lifecycle onboarding should not expose Resources Architect tools",
  );

  const manifest = buildRuntimeContextManifest({
    generatedAt: "2026-06-18T00:00:00.000Z",
    userId: "user",
    threadId: "thread",
    communityId: null,
    communityContextVersion: null,
    projectId: null,
    harnessName: "chat_tools",
    inferenceSource: "test",
    latestUserText: "Hi.",
    messages: [{ role: "user", content: "Hi." }],
    allowedToolNames: [],
    mountedTools: [],
    communityResourceLane: {
      lane: "none",
      can_read_live_resources: false,
      can_use_resource_builder: false,
    },
    selectedPlatformSkills: lifecycleSelectedSkills,
    selectedPersonalSkills: [],
    selectedCommunitySkills: [],
  });
  const onboardingPrompt = manifest.prompts.find(
    (prompt) => prompt.id === "platform_skill:onboarding-guide",
  );
  assert.equal(onboardingPrompt?.activationRoute, "lifecycle_trigger");
  assert.equal(
    onboardingPrompt?.activationReason,
    "account onboarding completed",
  );
  console.log("PASS: lifecycle onboarding uses selected skill harness path");
}

function proveRuntimeWiringMatchesContract() {
  const runtimeSkillResolution = readText("convex/runtimeSkillResolution.ts");
  const runtimeHarnessComposition = readText("convex/runtimeHarnessComposition.ts");
  const runtimeAgentLoop = readText("convex/runtimeAgentLoop.ts");
  const runtimeContextManifest = readText("shared/runtimeContextManifest.ts");
  const platformSkillRuntime = readText("convex/platformSkillRuntime.ts");
  const platformSkills = readText("shared/platformSkills.ts");
  const skillPackageTypes = readText("shared/skillPackageTypes.ts");

  assertIncludes(
    runtimeSkillResolution,
    "const includeSelectedData = requestedMentionTokens.length > 0",
    "explicit selection controls personal/community body loading",
  );
  assertIncludes(
    runtimeSkillResolution,
    "autoSelectedSkills",
    "platform-required skill activation",
  );
  assertIncludes(
    runtimeSkillResolution,
    "activation_route: \"platform_required\"",
    "platform-required activation route",
  );
  assertIncludes(
    runtimeSkillResolution,
    "activation_route: \"explicit_mention\"",
    "explicit mention activation route",
  );
  assertIncludes(
    runtimeSkillResolution,
    "buildRuntimeLifecyclePlatformSelectedSkills",
    "lifecycle-triggered platform skill selection",
  );
  assertIncludes(
    runtimeSkillResolution,
    "activation_route: \"lifecycle_trigger\"",
    "lifecycle trigger activation route",
  );
  assertIncludes(
    runtimeAgentLoop,
    "skillLifecycleTrigger",
    "runtime agent loop lifecycle trigger seam",
  );
  assertIncludes(
    runtimeSkillResolution,
    "filterUserSkillScopeAgainstPlatform",
    "platform shadowing",
  );
  assertIncludes(
    runtimeSkillResolution,
    "filterCommunitySkillScopeAgainstPlatform",
    "platform shadows community duplicates",
  );
  assertIncludes(
    runtimeSkillResolution,
    "filterUserSkillScopeAgainstCommunity",
    "community shadows personal duplicates",
  );
  assertIncludes(
    runtimeHarnessComposition,
    "DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS",
    "bounded inventory budget",
  );
  assertIncludes(
    runtimeHarnessComposition,
    "selected_user_platform_skills",
    "selected personal skill projection",
  );
  assertIncludes(
    runtimeAgentLoop,
    "buildEffectiveAllowedToolNames",
    "platform skill tool expansion seam",
  );
  assertIncludes(
    runtimeAgentLoop,
    "buildRuntimeContextManifest",
    "backend context manifest assembly",
  );
  assertIncludes(
    runtimeContextManifest,
    "pushSelectedSkillPrompts",
    "selected skill manifest evidence",
  );
  assertIncludes(
    runtimeContextManifest,
    "activationRoute",
    "selected skill activation route manifest evidence",
  );
  assertIncludes(
    runtimeContextManifest,
    "activationReason",
    "selected skill activation reason manifest evidence",
  );
  assertIncludes(
    platformSkillRuntime,
    "PLATFORM_RESOURCES_ARCHITECT_INSTRUCTIONS_MD",
    "built-in platform skill body",
  );
  assertIncludes(
    platformSkills,
    "requiresCapability",
    "platform skill capability gate metadata",
  );
  assertIncludes(
    skillPackageTypes,
    "instructionsMd",
    "current skill package body field",
  );
  assertExcludes(
    skillPackageTypes,
    "triggerPolicy",
    "deferred trigger policy field",
  );
  console.log("PASS: runtime wiring matches the skill harness contract");
}

function main() {
  proveContractNamesCurrentGroundTruth();
  proveBoundedInventoryBeforeSelectedBodies();
  proveExplicitSelectionAndAmbiguitySemantics();
  proveScopeShadowingAndPlatformToolExpansion();
  proveActivationEvidenceSurvivesRuntimeAndManifest();
  proveLifecycleOnboardingActivationUsesSkillHarnessPath();
  proveRuntimeWiringMatchesContract();
}

main();
