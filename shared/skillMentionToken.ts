const MAX_SKILL_MENTION_TOKEN_LENGTH = 80;

function normalizeSkillMentionSource(value: unknown): string {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_SKILL_MENTION_TOKEN_LENGTH)
    : "";
}

export function buildSkillMentionToken(value: unknown, fallback = "skill"): string {
  const base = normalizeSkillMentionSource(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, MAX_SKILL_MENTION_TOKEN_LENGTH);
}

export function formatSkillMentionToken(value: unknown): string | null {
  const token = buildSkillMentionToken(value, "");
  return token ? `$${token}` : null;
}
