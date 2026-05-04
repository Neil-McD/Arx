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

function buildMcpAppIdentityKey(mount: HarnessMount): string {
  const catalogAppId = normalizeMcpAppKeyPart(mount.app.catalog_app_id);
  if (catalogAppId) return `catalog:${catalogAppId}`;
  const endpointUrl = normalizeMcpAppKeyPart(mount.app.endpoint_url);
  const authType = normalizeMcpAppKeyPart(mount.app.auth_type);
  if (endpointUrl && authType) return `endpoint:${endpointUrl}:auth:${authType}`;
  const slug = normalizeMcpAppKeyPart(mount.app.slug);
  if (slug) return `slug:${slug}`;
  return `name:${normalizeMcpAppKeyPart(mount.app.name) || mount.id}`;
}

function chooseDisplayMount(
  personalMount: HarnessMount | null,
  communityMount: HarnessMount | null,
): HarnessMount {
  return communityMount ?? personalMount!;
}

function intersectEnabledToolNames(
  first: HarnessMount | null,
  second: HarnessMount | null,
): string[] {
  if (!first && !second) return [];
  if (!first) return second?.enabled_tools ?? [];
  if (!second) return first.enabled_tools;
  const secondEnabled = new Set(second.enabled_tools);
  return first.enabled_tools.filter((toolName) => secondEnabled.has(toolName));
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
  const groups = new Map<
    string,
    {
      personalMount: HarnessMount | null;
      communityMount: HarnessMount | null;
    }
  >();
  for (const mount of mounts) {
    const key = buildMcpAppIdentityKey(mount);
    const group = groups.get(key) ?? {
      personalMount: null,
      communityMount: null,
    };
    if (mount.scope === "user") {
      if (!group.personalMount) group.personalMount = mount;
    } else if (!group.communityMount) {
      group.communityMount = mount;
    }
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([identityKey, group]) => {
      const displayMount = chooseDisplayMount(
        group.personalMount,
        group.communityMount,
      );
      const credentialState = deriveCredentialState(group);
      const effectiveEnabledTools = group.communityMount
        ? intersectEnabledToolNames(group.personalMount, group.communityMount)
        : group.personalMount?.enabled_tools ?? [];
      return {
        app_identity_key: identityKey,
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
