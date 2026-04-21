import type { SkillPackageDetail } from "./skillPackageTypes";

export type UserPlatformInstalledSkill = {
  id: string;
  enabled: boolean;
  skill: SkillPackageDetail;
};
