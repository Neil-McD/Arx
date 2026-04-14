export type SkillPackageSummary = {
  id: string;
  name: string;
  mentionToken: string;
  description: string | null;
};

export type CommunityAttachedSkill = {
  id: string;
  enabled: boolean;
  skill: SkillPackageSummary;
};

export type CreateSkillPackageInput = {
  name: string;
  description?: string;
  instructions_md: string;
};
