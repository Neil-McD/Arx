import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildEffectiveSkills } from "../shared/effectiveSkills.ts";
import {
  COMMUNITY_MANAGER_PLATFORM_SKILLS,
  GLOBAL_PLATFORM_SKILLS,
  PLATFORM_RESOURCES_ARCHITECT_TOOL_NAMES,
  PLATFORM_RESOURCES_ARCHITECT_SKILL,
  buildPlatformSkillToolNamesForSelection,
  hasSelectedPlatformResourcesArchitectSkill,
} from "../shared/platformSkills.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function main() {
  assert.deepEqual(COMMUNITY_MANAGER_PLATFORM_SKILLS, [
    PLATFORM_RESOURCES_ARCHITECT_SKILL,
  ]);
  assert.deepEqual(GLOBAL_PLATFORM_SKILLS, []);
  assert.equal(PLATFORM_RESOURCES_ARCHITECT_SKILL.scope, "platform");
  assert.equal(PLATFORM_RESOURCES_ARCHITECT_SKILL.locked, true);
  assert.equal(PLATFORM_RESOURCES_ARCHITECT_SKILL.canDisable, false);
  assert.equal(PLATFORM_RESOURCES_ARCHITECT_SKILL.canDetach, false);
  assert.equal(
    PLATFORM_RESOURCES_ARCHITECT_SKILL.requiresCapability,
    "community_resources_manage",
  );
  assert.deepEqual(PLATFORM_RESOURCES_ARCHITECT_TOOL_NAMES, [
    "community_resource_builder_list",
    "community_resource_builder_read",
    "community_resource_builder_stage_changeset",
    "community_resource_builder_apply_changeset",
  ]);
  assert.equal(
    hasSelectedPlatformResourcesArchitectSkill([
      { platform_skill_id: "platform:resources-architect" },
    ]),
    true,
  );
  assert.deepEqual(
    buildPlatformSkillToolNamesForSelection([
      { mention_token: "resources-architect" },
    ]),
    PLATFORM_RESOURCES_ARCHITECT_TOOL_NAMES,
  );
  assert.deepEqual(buildPlatformSkillToolNamesForSelection([]), []);

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
          description: "User duplicate",
          catalogSkillId: null,
          instructionsMd: "User-controlled instructions.",
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
  assert.equal(projected[0]?.locked, true);
  assert.equal(projected[0]?.can_disable, false);
  assert.equal(projected[0]?.can_detach, false);
  assert.equal(projected[0]?.can_edit, false);
  assert.equal(projected[0]?.enabled_for_current_context, true);
  assert.equal(projected[0]?.platform_skill?.id, "platform:resources-architect");
  assert.equal(projected[0]?.personal_install?.id, "personal-install");
  assert.equal(projected[0]?.community_attachment?.id, "community-attachment");

  const personalOnly = buildEffectiveSkills({
    platformSkills: [],
    personalSkills: [
      {
        id: "personal-install",
        enabled: true,
        skill: {
          id: "personal-skill",
          name: "Weekly Research",
          mentionToken: "weekly-research",
          description: null,
          catalogSkillId: "weekly-research",
          instructionsMd: "Research instructions.",
        },
      },
    ],
    communitySkills: [],
  });
  assert.equal(personalOnly[0]?.scope, "personal");
  assert.equal(personalOnly[0]?.locked, false);
  assert.equal(personalOnly[0]?.can_disable, true);
  assert.equal(personalOnly[0]?.can_edit, true);

  const harnessSkills = readText("convex/harnessSkills.ts");
  const runtimeSkillResolution = readText(
    "convex/runtimeSkillResolution.ts",
  );
  const runtimeHarnessComposition = readText(
    "convex/runtimeHarnessComposition.ts",
  );
  const runtimeAgentLoop = readText("convex/runtimeAgentLoop.ts");
  const runtimeHarnessShaping = readText(
    "convex/runtimeHarnessShaping.ts",
  );
  const platformSkillRuntime = readText(
    "convex/platformSkillRuntime.ts",
  );
  const retrievalTools = readText(
    "shared/retrievalTools.ts",
  );
  const toolRegistry = readText("shared/toolRegistry.ts");
  const runtimeToolPolicy = readText(
    "shared/runtimeToolPolicy.ts",
  );
  const runtimePrompt = readText("shared/runtimePrompt.ts");
  const runtimeTurnResolution = readText(
    "convex/runtimeTurnResolution.ts",
  );
  const communitySkillAttachments = readText(
    "convex/communitySkillAttachments.ts",
  );
  const skillsEditor = readText(
    "apps/web/src/components/WebCommunityAiAgentSkillsEditor.tsx",
  );
  const settingsSection = readText(
    "apps/web/src/components/WebIntegrationsSettingsSection.tsx",
  );
  const app = readText("apps/web/src/App.tsx");

  assertIncludes(
    harnessSkills,
    "COMMUNITY_MANAGER_PLATFORM_SKILLS",
    "effective harness platform skill source",
  );
  assertIncludes(
    harnessSkills,
    "requireCommunityManager",
    "platform skill manager gate",
  );
  assertIncludes(
    harnessSkills,
    "canManageCommunityResources",
    "platform skill non-throwing manager check",
  );
  assertIncludes(
    platformSkillRuntime,
    "PLATFORM_RESOURCES_ARCHITECT_INSTRUCTIONS_MD",
    "server-side Resources Architect instructions",
  );
  assertIncludes(
    platformSkillRuntime,
    "GLOBAL_PLATFORM_RUNTIME_SKILLS",
    "global platform runtime skill inventory",
  );
  assert.ok(
    /GLOBAL_PLATFORM_RUNTIME_SKILLS:[^=]*= \[\]/.test(platformSkillRuntime),
    "retired onboarding must leave no global runtime skill",
  );
  assertIncludes(
    runtimeSkillResolution,
    "COMMUNITY_MANAGER_PLATFORM_RUNTIME_SKILLS",
    "runtime platform skill source",
  );
  assertIncludes(
    runtimeSkillResolution,
    "resolveCommunityResourceRuntimeLane",
    "runtime community resource lane resolver",
  );
  assertIncludes(
    runtimeSkillResolution,
    "community_resource_lane",
    "runtime community resource lane projection",
  );
  assertIncludes(
    runtimeSkillResolution,
    "communityResourceLane.lane !== \"builder\"",
    "runtime platform skill builder lane gate",
  );
  assertIncludes(
    runtimeSkillResolution,
    "filterCommunitySkillScopeAgainstPlatform",
    "runtime platform skill shadows optional community duplicates",
  );
  assertIncludes(
    runtimeSkillResolution,
    "selected_platform_skills",
    "runtime selected platform skill projection",
  );
  assertIncludes(
    runtimeSkillResolution,
    "autoSelectedSkills",
    "runtime Resources Architect auto-selection",
  );
  assertIncludes(
    runtimeSkillResolution,
    "...platformSkillScope.autoSelectedSkills",
    "builder lane auto-selected platform skill injection",
  );
  assertIncludes(
    runtimeHarnessShaping,
    "normalizeCommunityResourceRuntimeLaneState",
    "runtime community resource lane normalization",
  );
  assertIncludes(
    runtimeHarnessShaping,
    "normalizeRuntimeSelectedPlatformSkills",
    "runtime platform skill normalization",
  );
  assertIncludes(
    runtimeHarnessComposition,
    "buildPlatformSkillOverlayRuntimeState",
    "platform skill prompt composition",
  );
  assertIncludes(
    runtimeHarnessComposition,
    "activePlatformModule?.systemPromptSuffix",
    "platform skill prompt injection",
  );
  assertIncludes(
    runtimeAgentLoop,
    "platform_skills_resolved",
    "platform skill runtime evidence event",
  );
  assertIncludes(
    runtimeAgentLoop,
    "community_resource_lane",
    "platform skill runtime evidence includes resource lane",
  );
  for (const toolName of PLATFORM_RESOURCES_ARCHITECT_TOOL_NAMES) {
    assertIncludes(retrievalTools, toolName, "Resources Architect retrieval tool");
    assertIncludes(toolRegistry, `${toolName}: {`, "Resources Architect tool registry entry");
    assertIncludes(runtimeToolPolicy, `${toolName}: {`, "Resources Architect tool policy");
    assertIncludes(runtimeAgentLoop, `params.toolName === "${toolName}"`, "Resources Architect tool executor");
  }
  assertIncludes(
    runtimeAgentLoop,
    "buildEffectiveAllowedToolNames",
    "selected platform skill tool exposure",
  );
  assertIncludes(
    runtimeAgentLoop,
    "buildPlatformSkillToolNamesForSelection",
    "platform skill tool selection helper",
  );
  assert.ok(
    !/resolveAllowedToolNames[\s\S]*community_resource_builder_list/.test(
      runtimeTurnResolution,
    ),
    "builder tools must not be exposed by default community tool entitlement",
  );
  assert.ok(
    !/resolveAllowedToolNames[\s\S]*member_profile_confirm_facts/.test(
      runtimeTurnResolution,
    ),
    "dormant member profile confirmation must not be a default community entitlement",
  );
  assertIncludes(
    runtimePrompt,
    "COMMUNITY_RESOURCE_MEMBER_LANE",
    "member resource lane prompt",
  );
  assertIncludes(
    runtimePrompt,
    "Broad read workflow: map or list the live Resources wiki first",
    "member resource lane broad read workflow",
  );
  assertIncludes(
    runtimePrompt,
    "When the member is stuck on a project or workflow",
    "member resource lane project guidance",
  );
  assertIncludes(
    runtimePrompt,
    "Do not edit, stage, refactor, or apply changes from the member lane",
    "member resource lane edit boundary",
  );
  assertIncludes(
    runtimePrompt,
    "COMMUNITY_RESOURCE_BUILDER_LANE",
    "builder resource lane prompt",
  );
  assertIncludes(
    runtimePrompt,
    "For read-only member-style questions, follow the live Resources read workflow",
    "builder resource lane inherits member read workflow",
  );
  assertIncludes(
    runtimePrompt,
    "Broad requests like improve resources",
    "builder resource lane discovery-first behavior",
  );
  assertIncludes(
    runtimePrompt,
    "Builder-facing replies must translate resource tool results into product state",
    "builder resource lane must orient the human to product state",
  );
  assertIncludes(
    runtimePrompt,
    "Do not expose internal ids, database ids, resource ids",
    "builder resource lane must hide internal ids in user-facing prose",
  );
  assertIncludes(
    runtimePrompt,
    "Do not ask the builder to paste a changeset id",
    "builder resource lane must use natural approval instead of id-paste approval",
  );
  assertIncludes(
    runtimePrompt,
    "source-unit count when visible",
    "builder resource lane must report source-unit visibility after crawls/imports",
  );
  assertIncludes(
    runtimePrompt,
    "Resources Architect builder tools are builder-lane only",
    "Resources Architect tool prompt guidance",
  );
  assertIncludes(
    platformSkillRuntime,
    "do not stage edits immediately",
    "Resources Architect broad requests must not stage immediately",
  );
  assertIncludes(
    platformSkillRuntime,
    "ask the builder what direction they want to take",
    "Resources Architect must align before editing",
  );
  assert.ok(
    !communitySkillAttachments.includes("PLATFORM_RESOURCES_ARCHITECT_SKILL"),
    "platform Resources Architect must not be stored as a community attachment",
  );
  assertIncludes(
    skillsEditor,
    "Available by default",
    "community skills editor platform section",
  );
  assertIncludes(
    skillsEditor,
    "Built in",
    "community skills editor platform badge",
  );
  assertIncludes(
    skillsEditor,
    "Locked",
    "community skills editor locked platform state",
  );
  assertIncludes(
    settingsSection,
    "Platform default",
    "settings effective skills platform scope label",
  );
  assertIncludes(
    settingsSection,
    "Available by default",
    "settings effective skills platform invocation label",
  );
  assertIncludes(
    settingsSection,
    "effectiveSkill.can_edit",
    "settings effective skills must hide user edit controls for locked platform skills",
  );
  assert.match(
    app,
    /activeCommunityId && canManageResourcesActiveCommunity[\s\S]*\? COMMUNITY_MANAGER_PLATFORM_SKILLS/,
    "settings platform skill fallback should use resource-builder authority",
  );
  assert.match(
    app,
    /platformSkills: canManageResourcesActiveCommunity[\s\S]*\? COMMUNITY_MANAGER_PLATFORM_SKILLS/,
    "community AI skills editor should use resource-builder authority",
  );
  assert.ok(
    !/platformSkills:\s*canManageMembersActiveCommunity[\s\S]*\? COMMUNITY_MANAGER_PLATFORM_SKILLS/.test(app),
    "platform Resources Architect visibility must not be tied to member-management authority",
  );

  console.log("platform_skill_contract_proof: ok");
}

main();
