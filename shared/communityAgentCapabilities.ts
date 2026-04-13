export type CommunityAgentCapabilityEntry = {
  id: string;
  name: string;
  description: string;
};

export type CommunityAgentSkill = CommunityAgentCapabilityEntry;
export type CommunityAgentApp = CommunityAgentCapabilityEntry;

const MAX_CAPABILITY_COUNT = 24;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 8_000;

function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeCapabilityEntries(
  input: unknown,
  params: {
    idPrefix: string;
    defaultName: string;
  },
): CommunityAgentCapabilityEntry[] {
  const rows = Array.isArray(input) ? input : [];
  const normalized: CommunityAgentCapabilityEntry[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const candidate = row as Record<string, unknown>;
    const name = normalizeString(candidate.name, MAX_NAME_LENGTH);
    const description = normalizeString(candidate.description, MAX_DESCRIPTION_LENGTH);
    if (!name && !description) continue;

    let id = normalizeString(candidate.id, 80) || `${params.idPrefix}-${index + 1}`;
    while (seenIds.has(id)) id = `${id}-x`;
    seenIds.add(id);

    normalized.push({
      id,
      name: name || `${params.defaultName} ${normalized.length + 1}`,
      description,
    });

    if (normalized.length >= MAX_CAPABILITY_COUNT) break;
  }

  return normalized;
}

export function normalizeCommunityAgentSkills(input: unknown): CommunityAgentSkill[] {
  return normalizeCapabilityEntries(input, {
    idPrefix: "skill",
    defaultName: "Skill",
  });
}

export function normalizeCommunityAgentApps(input: unknown): CommunityAgentApp[] {
  return normalizeCapabilityEntries(input, {
    idPrefix: "app",
    defaultName: "App",
  });
}

export function normalizeCommunityAgentSkillsForSave(
  draft: unknown,
): CommunityAgentSkill[] {
  return normalizeCommunityAgentSkills(draft);
}

export function normalizeCommunityAgentAppsForSave(
  draft: unknown,
): CommunityAgentApp[] {
  return normalizeCommunityAgentApps(draft);
}
