import type { CommunityAttachedSkill } from "./communitySkillTypes";
import type { PlatformSkillCapability, PlatformSkillSummary } from "./platformSkills";
import type { SkillPackageSummary } from "./skillPackageTypes";
import type { UserPlatformInstalledSkill } from "./userPlatformSkillTypes";

export type EffectiveSkillScope = "platform" | "community" | "personal";

function normalizeSkillKeyPart(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

type SkillIdentitySource = {
  id?: string | null;
  skill: Pick<SkillPackageSummary, "catalogSkillId" | "mentionToken" | "name">;
};

export function buildSkillIdentityAliases(source: SkillIdentitySource): string[] {
  const aliases: string[] = [];
  const catalogSkillId = normalizeSkillKeyPart(source.skill.catalogSkillId);
  if (catalogSkillId) aliases.push(`catalog:${catalogSkillId}`);
  const mentionToken = normalizeSkillKeyPart(source.skill.mentionToken);
  if (mentionToken) aliases.push(`mention:${mentionToken}`);
  if (aliases.length > 0) return aliases;
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
  platformSkill: PlatformSkillSummary | null,
  personalInstall: UserPlatformInstalledSkill | null,
  communityAttachment: CommunityAttachedSkill | null,
): SkillPackageSummary {
  if (platformSkill) return platformSkill;
  return communityAttachment?.skill ?? personalInstall!.skill;
}

function chooseEffectiveSkillScope(args: {
  platformSkill: PlatformSkillSummary | null;
  communityAttachment: CommunityAttachedSkill | null;
}): EffectiveSkillScope {
  if (args.platformSkill) return "platform";
  if (args.communityAttachment) return "community";
  return "personal";
}

function chooseEffectiveSkillCapability(
  platformSkill: PlatformSkillSummary | null,
): PlatformSkillCapability | null {
  return platformSkill?.requiresCapability ?? null;
}

function buildEffectiveSkillAliases(
  source:
    | { scope: "platform"; value: PlatformSkillSummary }
    | { scope: "personal"; value: UserPlatformInstalledSkill }
    | { scope: "community"; value: CommunityAttachedSkill },
): string[] {
  if (source.scope === "platform") {
    return buildSkillIdentityAliases({
      id: source.value.id,
      skill: source.value,
    });
  }
  return buildSkillIdentityAliases(source.value);
}

export function buildEffectiveSkills(args: {
  platformSkills?: PlatformSkillSummary[];
  personalSkills: UserPlatformInstalledSkill[];
  communitySkills: CommunityAttachedSkill[];
}) {
  type EffectiveSkillGroup = {
    aliases: Set<string>;
    identityKey: string;
    platformSkill: PlatformSkillSummary | null;
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
      | { scope: "platform"; value: PlatformSkillSummary }
      | { scope: "personal"; value: UserPlatformInstalledSkill }
      | { scope: "community"; value: CommunityAttachedSkill },
  ) => {
    const aliases = buildEffectiveSkillAliases(source);
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
      platformSkill: null,
      personalInstall: null,
      communityAttachment: null,
    };
    if (matchedGroups.length === 0) groups.push(group);
    for (const extraGroup of matchedGroups.slice(1)) {
      if (!group.platformSkill && extraGroup.platformSkill) {
        group.platformSkill = extraGroup.platformSkill;
      }
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
    if (source.scope === "platform") {
      if (!group.platformSkill) group.platformSkill = source.value;
    } else if (source.scope === "personal") {
      if (!group.personalInstall) group.personalInstall = source.value;
    } else if (!group.communityAttachment) {
      group.communityAttachment = source.value;
    }
    addAliasesToGroup(group, aliases);
  };

  for (const skill of args.platformSkills ?? []) {
    addSkill({ scope: "platform", value: skill });
  }
  for (const skill of args.personalSkills) {
    addSkill({ scope: "personal", value: skill });
  }
  for (const skill of args.communitySkills) {
    addSkill({ scope: "community", value: skill });
  }

  return groups
    .map((group) => {
      const scope = chooseEffectiveSkillScope({
        platformSkill: group.platformSkill,
        communityAttachment: group.communityAttachment,
      });
      const isPlatform = scope === "platform";
      return {
        skill_identity_key: group.identityKey,
        scope,
        skill: chooseDisplaySkill(
          group.platformSkill,
          group.personalInstall,
          group.communityAttachment,
        ),
        platform_skill: group.platformSkill,
        personal_install: group.personalInstall,
        community_attachment: group.communityAttachment,
        has_platform_skill: Boolean(group.platformSkill),
        has_personal_install: Boolean(group.personalInstall),
        is_attached_to_community: Boolean(group.communityAttachment),
        enabled_for_current_context: Boolean(
          isPlatform ||
            group.communityAttachment?.enabled ||
            group.personalInstall?.enabled,
        ),
        locked: isPlatform,
        can_disable: !isPlatform,
        can_detach: !isPlatform && Boolean(group.communityAttachment),
        can_edit: !isPlatform && Boolean(group.personalInstall),
        requires_capability: chooseEffectiveSkillCapability(group.platformSkill),
      };
    })
    .sort((left, right) => {
      const scopePriority: Record<EffectiveSkillScope, number> = {
        platform: 0,
        community: 1,
        personal: 2,
      };
      return (
        scopePriority[left.scope] - scopePriority[right.scope] ||
        left.skill.name.localeCompare(right.skill.name)
      );
    });
}

export type EffectiveSkill = ReturnType<typeof buildEffectiveSkills>[number];
