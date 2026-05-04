import type { HarnessMount } from "./harnessMountTypes";

export type EffectiveMcpAppCredentialState =
  | "live"
  | "needs_personal_setup"
  | "community_live"
  | "not_live";

export type EffectiveMcpAppPrimaryAction =
  | "manage_personal"
  | "setup_personal"
  | "manage_community"
  | "none";

function normalizeMcpAppKeyPart(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export type McpAppIdentitySource = {
  id?: string | null;
  app: {
    catalog_app_id?: string | null;
    endpoint_url?: string | null;
    auth_type?: string | null;
    slug?: string | null;
    name?: string | null;
  };
};

export function buildMcpAppIdentityAliases(source: McpAppIdentitySource): string[] {
  const aliases: string[] = [];
  const catalogAppId = normalizeMcpAppKeyPart(source.app.catalog_app_id);
  if (catalogAppId) aliases.push(`catalog:${catalogAppId}`);
  const endpointUrl = normalizeMcpAppKeyPart(source.app.endpoint_url);
  const authType = normalizeMcpAppKeyPart(source.app.auth_type);
  if (endpointUrl && authType) aliases.push(`endpoint:${endpointUrl}:auth:${authType}`);
  if (aliases.length > 0) return aliases;
  const slug = normalizeMcpAppKeyPart(source.app.slug);
  if (slug) return [`slug:${slug}`];
  const fallback = normalizeMcpAppKeyPart(source.app.name) || normalizeMcpAppKeyPart(source.id);
  return [`name:${fallback || "unknown"}`];
}

export function mcpAppIdentitySourcesOverlap(
  left: McpAppIdentitySource,
  right: McpAppIdentitySource,
): boolean {
  const rightAliases = new Set(buildMcpAppIdentityAliases(right));
  return buildMcpAppIdentityAliases(left).some((alias) => rightAliases.has(alias));
}

function compareIdentityKeyPriority(left: string, right: string): number {
  const priority = (key: string) => {
    if (key.startsWith("catalog:")) return 0;
    if (key.startsWith("endpoint:")) return 1;
    if (key.startsWith("slug:")) return 2;
    return 3;
  };
  return priority(left) - priority(right) || left.localeCompare(right);
}

function choosePreferredIdentityKey(aliases: Iterable<string>): string {
  return [...aliases].sort(compareIdentityKeyPriority)[0] ?? "name:unknown";
}

function chooseDisplayMount(
  personalMount: HarnessMount | null,
  communityMount: HarnessMount | null,
): HarnessMount {
  return personalMount ?? communityMount!;
}

function deriveEffectiveEnabledToolNames(args: {
  personalMount: HarnessMount | null;
  communityMount: HarnessMount | null;
}): string[] {
  const { personalMount, communityMount } = args;
  if (!personalMount) return communityMount?.enabled_tools ?? [];
  if (!communityMount) return personalMount.enabled_tools;
  if (personalMount.live_status === "live" && communityMount.enabled_tools.length === 0) {
    return personalMount.enabled_tools;
  }
  const communityEnabled = new Set(communityMount.enabled_tools);
  return personalMount.enabled_tools.filter((toolName) =>
    communityEnabled.has(toolName),
  );
}

function deriveCredentialState(args: {
  personalMount: HarnessMount | null;
  communityMount: HarnessMount | null;
}): {
  credential_state: EffectiveMcpAppCredentialState;
  live_for_current_user: boolean;
  setup_reason: string | null;
  primary_action: EffectiveMcpAppPrimaryAction;
} {
  const { personalMount, communityMount } = args;
  if (personalMount?.live_status === "live") {
    return {
      credential_state: "live",
      live_for_current_user: true,
      setup_reason: null,
      primary_action: "manage_personal",
    };
  }
  if (communityMount && !personalMount && communityMount.app.auth_type !== "none") {
    return {
      credential_state: "needs_personal_setup",
      live_for_current_user: false,
      setup_reason: "needs_personal_connection",
      primary_action: "setup_personal",
    };
  }
  if (personalMount) {
    return {
      credential_state: "needs_personal_setup",
      live_for_current_user: false,
      setup_reason: personalMount.not_live_reason ?? "unknown",
      primary_action: "setup_personal",
    };
  }
  if (communityMount?.live_status === "live") {
    return {
      credential_state: "community_live",
      live_for_current_user: true,
      setup_reason: null,
      primary_action: "manage_community",
    };
  }
  return {
    credential_state: "not_live",
    live_for_current_user: false,
    setup_reason: communityMount?.not_live_reason ?? "unknown",
    primary_action: communityMount ? "manage_community" : "none",
  };
}

export function buildEffectiveMcpApps(mounts: HarnessMount[]) {
  type EffectiveMcpAppGroup = {
    aliases: Set<string>;
    identityKey: string;
    personalMount: HarnessMount | null;
    communityMount: HarnessMount | null;
  };
  const groups: EffectiveMcpAppGroup[] = [];
  const aliasToGroup = new Map<string, EffectiveMcpAppGroup>();

  const addAliasesToGroup = (group: EffectiveMcpAppGroup, aliases: string[]) => {
    for (const alias of aliases) {
      group.aliases.add(alias);
      aliasToGroup.set(alias, group);
    }
    group.identityKey = choosePreferredIdentityKey(group.aliases);
  };

  for (const mount of mounts) {
    const aliases = buildMcpAppIdentityAliases(mount);
    const matchedGroups = [
      ...new Set(
        aliases
          .map((alias) => aliasToGroup.get(alias))
          .filter((group): group is EffectiveMcpAppGroup => Boolean(group)),
      ),
    ];
    const group = matchedGroups[0] ?? {
      aliases: new Set<string>(),
      identityKey: choosePreferredIdentityKey(aliases),
      personalMount: null,
      communityMount: null,
    };
    if (matchedGroups.length === 0) groups.push(group);
    for (const extraGroup of matchedGroups.slice(1)) {
      if (!group.personalMount && extraGroup.personalMount) {
        group.personalMount = extraGroup.personalMount;
      }
      if (!group.communityMount && extraGroup.communityMount) {
        group.communityMount = extraGroup.communityMount;
      }
      addAliasesToGroup(group, [...extraGroup.aliases]);
      const extraIndex = groups.indexOf(extraGroup);
      if (extraIndex >= 0) groups.splice(extraIndex, 1);
    }
    if (mount.scope === "user") {
      if (!group.personalMount) group.personalMount = mount;
    } else if (!group.communityMount) {
      group.communityMount = mount;
    }
    addAliasesToGroup(group, aliases);
  }

  return groups
    .map((group) => {
      const displayMount = chooseDisplayMount(
        group.personalMount,
        group.communityMount,
      );
      const credentialState = deriveCredentialState(group);
      const effectiveEnabledTools = deriveEffectiveEnabledToolNames(group);
      return {
        app_identity_key: group.identityKey,
        app: displayMount.app,
        personal_mount: group.personalMount,
        community_mount: group.communityMount,
        is_attached_to_community: Boolean(group.communityMount),
        has_personal_mount: Boolean(group.personalMount),
        has_personal_connection: group.personalMount?.live_status === "live",
        live_for_current_user: credentialState.live_for_current_user,
        credential_state: credentialState.credential_state,
        setup_reason: credentialState.setup_reason,
        primary_action: credentialState.primary_action,
        effective_enabled_tools: effectiveEnabledTools,
        effective_tool_count: effectiveEnabledTools.length,
      };
    })
    .sort((left, right) => left.app.name.localeCompare(right.app.name));
}

export type EffectiveMcpApp = ReturnType<typeof buildEffectiveMcpApps>[number];
