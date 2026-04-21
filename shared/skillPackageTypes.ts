export type SkillPackageSummary = {
  id: string;
  name: string;
  mentionToken: string;
  description: string | null;
};

export type CreateSkillPackageInput = {
  name: string;
  description?: string;
  instructions_md: string;
};
