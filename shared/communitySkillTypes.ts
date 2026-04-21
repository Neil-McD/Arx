import type { SkillPackageSummary } from "./skillPackageTypes";

export type { CreateSkillPackageInput, SkillPackageSummary } from "./skillPackageTypes";

export type CommunityAttachedSkill = {
  id: string;
  enabled: boolean;
  skill: SkillPackageSummary;
};
