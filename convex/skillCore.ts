import {
  buildSkillMentionToken,
} from "../shared/skillMentionToken.ts";

export { buildSkillMentionToken };

export type SkillPackageRow = {
  _id: any;
  ownerUserId: any;
  catalogSkillId?: string;
  name: string;
  mentionToken?: string;
  description?: string;
  instructionsMd: string;
  activeRevisionId?: any;
  createdAt: number;
  updatedAt: number;
};

export type SkillPackageRevisionRow = {
  _id: any;
  skillPackageId: any;
  revisionNumber: number;
  instructionsMd: string;
  createdAt: number;
  createdByUserId: any;
};

const MAX_SKILL_NAME_LENGTH = 120;
const MAX_SKILL_CATALOG_ID_LENGTH = 120;
const MAX_SKILL_DESCRIPTION_LENGTH = 2_000;
const MAX_SKILL_BODY_LENGTH = 40_000;

export function normalizeSkillString(value: unknown, maxLength = 10_000): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeSkillPackageName(value: unknown): string {
  return normalizeSkillString(value, MAX_SKILL_NAME_LENGTH);
}

export function normalizeSkillCatalogId(value: unknown): string {
  return normalizeSkillString(value, MAX_SKILL_CATALOG_ID_LENGTH).toLowerCase();
}

export function normalizeSkillMentionToken(value: unknown, fallback = "skill"): string {
  return buildSkillMentionToken(value, fallback);
}

export function normalizeSkillPackageDescription(value: unknown): string {
  return normalizeSkillString(value, MAX_SKILL_DESCRIPTION_LENGTH);
}

export function normalizeSkillInstructionsMd(value: unknown): string {
  return normalizeSkillString(value, MAX_SKILL_BODY_LENGTH);
}

export function readSkillMentionToken(skill: Pick<SkillPackageRow, "mentionToken" | "name">): string {
  return normalizeSkillMentionToken(skill.mentionToken || skill.name);
}

export async function getSkillPackageActiveRevision(
  ctx: any,
  skill: SkillPackageRow | null | undefined,
): Promise<SkillPackageRevisionRow | null> {
  if (!skill?.activeRevisionId) return null;
  return ((await ctx.db.get(skill.activeRevisionId)) as SkillPackageRevisionRow | null) ?? null;
}

export async function getSkillPackageActiveInstructionsMd(
  ctx: any,
  skill: SkillPackageRow | null | undefined,
): Promise<{
  instructionsMd: string;
  revisionId: any | null;
}> {
  const revision = await getSkillPackageActiveRevision(ctx, skill);
  if (revision?.instructionsMd) {
    return {
      instructionsMd: revision.instructionsMd,
      revisionId: revision._id,
    };
  }
  return {
    instructionsMd: normalizeSkillInstructionsMd(skill?.instructionsMd),
    revisionId: null,
  };
}

export function mapSkillPackageReadModel(skill: SkillPackageRow) {
  return {
    id: String(skill._id),
    name: skill.name,
    mentionToken: readSkillMentionToken(skill),
    description: skill.description ?? null,
    catalogSkillId: skill.catalogSkillId ?? null,
  };
}
