import type { SkillPackageSummary } from "./skillPackageTypes";
import type { RetrievalToolName } from "./retrievalTools";

export type PlatformSkillCapability = "community_resources_manage";

export type PlatformSkillSummary = SkillPackageSummary & {
  scope: "platform";
  locked: true;
  canDisable: false;
  canDetach: false;
  requiresCapability: PlatformSkillCapability;
};

export const PLATFORM_RESOURCES_ARCHITECT_SKILL: PlatformSkillSummary = {
  id: "platform:resources-architect",
  catalogSkillId: "platform-resources-architect",
  name: "Resources Architect",
  mentionToken: "resources-architect",
  description:
    "Organize, refactor, and draft community Resources from source material.",
  scope: "platform",
  locked: true,
  canDisable: false,
  canDetach: false,
  requiresCapability: "community_resources_manage",
};

export const COMMUNITY_MANAGER_PLATFORM_SKILLS: PlatformSkillSummary[] = [
  PLATFORM_RESOURCES_ARCHITECT_SKILL,
];

export const PLATFORM_RESOURCES_ARCHITECT_TOOL_NAMES = [
  "community_resource_builder_list",
  "community_resource_builder_read",
  "community_resource_builder_stage_changeset",
  "community_resource_builder_apply_changeset",
] as const satisfies readonly RetrievalToolName[];

export type PlatformSkillSelectionSummary = {
  platform_skill_id?: unknown;
  mention_token?: unknown;
};

export function hasSelectedPlatformResourcesArchitectSkill(
  selectedSkills: readonly PlatformSkillSelectionSummary[],
): boolean {
  const platformSkillId = PLATFORM_RESOURCES_ARCHITECT_SKILL.id.toLowerCase();
  const mentionToken = PLATFORM_RESOURCES_ARCHITECT_SKILL.mentionToken.toLowerCase();
  return selectedSkills.some((skill) => {
    const id = String(skill.platform_skill_id ?? "").trim().toLowerCase();
    const token = String(skill.mention_token ?? "").trim().toLowerCase();
    return id === platformSkillId || token === mentionToken;
  });
}

export function buildPlatformSkillToolNamesForSelection(
  selectedSkills: readonly PlatformSkillSelectionSummary[],
): readonly RetrievalToolName[] {
  return hasSelectedPlatformResourcesArchitectSkill(selectedSkills)
    ? PLATFORM_RESOURCES_ARCHITECT_TOOL_NAMES
    : [];
}
