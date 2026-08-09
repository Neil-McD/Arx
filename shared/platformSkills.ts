import type { SkillPackageSummary } from "./skillPackageTypes";

export type PlatformSkillCapability = "community_resources_manage";

export type PlatformSkillSummary = SkillPackageSummary & {
  scope: "platform";
  locked: true;
  canDisable: false;
  canDetach: false;
  requiresCapability: PlatformSkillCapability | null;
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

export const GLOBAL_PLATFORM_SKILLS: PlatformSkillSummary[] = [];
