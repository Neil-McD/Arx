import type { CommunityAttachedSkill } from "./communitySkillTypes";
import type { SkillPackageSummary } from "./skillPackageTypes";
import type { UserPlatformInstalledSkill } from "./userPlatformSkillTypes";

function normalizeSkillKeyPart(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

type SkillIdentitySource = {
  id?: string | null;
  skill: Pick<SkillPackageSummary, "catalogSkillId" | "mentionToken" | "name">;
};

export function buildSkillIdentityAliases(source: SkillIdentitySource): string[] {
  const catalogSkillId = normalizeSkillKeyPart(source.skill.catalogSkillId);
  if (catalogSkillId) return [`catalog:${catalogSkillId}`];
  const mentionToken = normalizeSkillKeyPart(source.skill.mentionToken);
  if (mentionToken) return [`mention:${mentionToken}`];
  const fallback =
    normalizeSkillKeyPart(source.skill.name) || normalizeSkillKeyPart(source.id);
  return [`name:${fallback || "unknown"}`];
}

function choosePreferredIdentityKey(aliases: Iterable<string>): string {
  return [...aliases].sort((left, right) => {
    const priority = (key: string) => {
      if (key.startsWith("catalog:")) return 0;
      if (key.startsWith("mention:")) return 1;
      return 2;
    };
    return priority(left) - priority(right) || left.localeCompare(right);
  })[0] ?? "name:unknown";
}

function chooseDisplaySkill(
  personalInstall: UserPlatformInstalledSkill | null,
  communityAttachment: CommunityAttachedSkill | null,
): SkillPackageSummary {
  return communityAttachment?.skill ?? personalInstall!.skill;
}

export function buildEffectiveSkills(args: {
  personalSkills: UserPlatformInstalledSkill[];
  communitySkills: CommunityAttachedSkill[];
}) {
  type EffectiveSkillGroup = {
    aliases: Set<string>;
    identityKey: string;
    personalInstall: UserPlatformInstalledSkill | null;
    communityAttachment: CommunityAttachedSkill | null;
  };
  const groups: EffectiveSkillGroup[] = [];
  const aliasToGroup = new Map<string, EffectiveSkillGroup>();

  const addAliasesToGroup = (group: EffectiveSkillGroup, aliases: string[]) => {
    for (const alias of aliases) {
      group.aliases.add(alias);
      aliasToGroup.set(alias, group);
    }
    group.identityKey = choosePreferredIdentityKey(group.aliases);
  };

  const addSkill = (
    source:
      | { scope: "personal"; value: UserPlatformInstalledSkill }
      | { scope: "community"; value: CommunityAttachedSkill },
  ) => {
    const aliases = buildSkillIdentityAliases(source.value);
    const matchedGroups = [
      ...new Set(
        aliases
          .map((alias) => aliasToGroup.get(alias))
          .filter((group): group is EffectiveSkillGroup => Boolean(group)),
      ),
    ];
    const group = matchedGroups[0] ?? {
      aliases: new Set<string>(),
      identityKey: choosePreferredIdentityKey(aliases),
      personalInstall: null,
      communityAttachment: null,
    };
    if (matchedGroups.length === 0) groups.push(group);
    for (const extraGroup of matchedGroups.slice(1)) {
      if (!group.personalInstall && extraGroup.personalInstall) {
        group.personalInstall = extraGroup.personalInstall;
      }
      if (!group.communityAttachment && extraGroup.communityAttachment) {
        group.communityAttachment = extraGroup.communityAttachment;
      }
      addAliasesToGroup(group, [...extraGroup.aliases]);
      const extraIndex = groups.indexOf(extraGroup);
      if (extraIndex >= 0) groups.splice(extraIndex, 1);
    }
    if (source.scope === "personal") {
      if (!group.personalInstall) group.personalInstall = source.value;
    } else if (!group.communityAttachment) {
      group.communityAttachment = source.value;
    }
    addAliasesToGroup(group, aliases);
  };

  for (const skill of args.personalSkills) {
    addSkill({ scope: "personal", value: skill });
  }
  for (const skill of args.communitySkills) {
    addSkill({ scope: "community", value: skill });
  }

  return groups
    .map((group) => ({
      skill_identity_key: group.identityKey,
      skill: chooseDisplaySkill(group.personalInstall, group.communityAttachment),
      personal_install: group.personalInstall,
      community_attachment: group.communityAttachment,
      has_personal_install: Boolean(group.personalInstall),
      is_attached_to_community: Boolean(group.communityAttachment),
      enabled_for_current_context: Boolean(
        group.communityAttachment?.enabled || group.personalInstall?.enabled,
      ),
    }))
    .sort((left, right) => left.skill.name.localeCompare(right.skill.name));
}

export type EffectiveSkill = ReturnType<typeof buildEffectiveSkills>[number];
