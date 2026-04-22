export type SkillPackageSummary = {
  id: string;
  name: string;
  mentionToken: string;
  description: string | null;
  catalogSkillId: string | null;
};

export type SkillPackageDetail = SkillPackageSummary & {
  instructionsMd: string;
};

export type CreateSkillPackageInput = {
  name: string;
  description?: string;
  instructions_md: string;
  catalog_skill_id?: string;
};
