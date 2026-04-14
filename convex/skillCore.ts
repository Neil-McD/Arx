export type SkillPackageRow = {
  _id: any;
  ownerUserId: any;
  name: string;
  description?: string;
  instructionsMd: string;
  createdAt: number;
  updatedAt: number;
};

const MAX_SKILL_NAME_LENGTH = 120;
const MAX_SKILL_MENTION_TOKEN_LENGTH = 80;
const MAX_SKILL_DESCRIPTION_LENGTH = 2_000;
const MAX_SKILL_BODY_LENGTH = 40_000;

export function normalizeSkillString(value: unknown, maxLength = 10_000): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeSkillPackageName(value: unknown): string {
  return normalizeSkillString(value, MAX_SKILL_NAME_LENGTH);
}

export function buildSkillMentionToken(value: unknown, fallback = "skill"): string {
  const base = normalizeSkillString(
    value || fallback,
    MAX_SKILL_MENTION_TOKEN_LENGTH,
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, MAX_SKILL_MENTION_TOKEN_LENGTH);
}

export function normalizeSkillPackageDescription(value: unknown): string {
  return normalizeSkillString(value, MAX_SKILL_DESCRIPTION_LENGTH);
}

export function normalizeSkillInstructionsMd(value: unknown): string {
  return normalizeSkillString(value, MAX_SKILL_BODY_LENGTH);
}

export function mapSkillPackageReadModel(skill: SkillPackageRow) {
  return {
    id: String(skill._id),
    name: skill.name,
    mentionToken: buildSkillMentionToken(skill.name),
    description: skill.description ?? null,
  };
}
