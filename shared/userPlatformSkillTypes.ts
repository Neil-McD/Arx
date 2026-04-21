import type { SkillPackageSummary } from "./skillPackageTypes";

export type UserPlatformInstalledSkill = {
  id: string;
  enabled: boolean;
  skill: SkillPackageSummary;
};
