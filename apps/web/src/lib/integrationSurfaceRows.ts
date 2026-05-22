import type { CommunityMountedApp } from "../../../../shared/communityAppMountTypes";
import {
  buildMcpAppIdentityAliases,
  mcpAppIdentitySourcesOverlap,
  type EffectiveMcpApp,
} from "../../../../shared/effectiveMcpApps";
import type { HarnessMount } from "../../../../shared/harnessMountTypes";
import { findDiscoverCatalogEntryForAppIdentity } from "./discoverCatalogMatching";

export type IntegrationSurfaceStateTone =
  | "live"
  | "setup"
  | "not-live"
  | "disabled"
  | "attached";

export type IntegrationSurfaceRow = {
  id: string;
  appIdentityKey: string;
  name: string;
  logoUrl: string | null;
  logoUrlDark: string | null;
  stateLabel: string;
  stateTone: IntegrationSurfaceStateTone;
  toolCountLabel: string;
  toolNames: string[];
  enabled: boolean;
  canToggle: boolean;
  canSetup: boolean;
  isBusy: boolean;
  effectiveApp: EffectiveMcpApp | null;
  communityMount: CommunityMountedApp | HarnessMount | null;
};

export function pluralizeIntegrationTools(count: number): string {
  return `${count} ${count === 1 ? "tool" : "tools"}`;
}

function uniqueToolNames(toolNames: string[]): string[] {
  return [...new Set(toolNames.map((name) => name.trim()).filter(Boolean))];
}

function getCommunityMountEnabledToolNames(
  mount: CommunityMountedApp | HarnessMount,
): string[] {
  const enabledToolNames = mount.tools
    .filter((tool) => tool.enabled)
    .map((tool) => tool.tool_name);
  return uniqueToolNames(enabledToolNames.length > 0 ? enabledToolNames : mount.enabled_tools);
}

function getIntegrationToolNames(args: {
  effectiveApp: EffectiveMcpApp | null;
  communityMount?: CommunityMountedApp | HarnessMount | null;
}): string[] {
  if (args.effectiveApp?.effective_enabled_tools.length) {
    return uniqueToolNames(args.effectiveApp.effective_enabled_tools);
  }
  return args.communityMount ? getCommunityMountEnabledToolNames(args.communityMount) : [];
}

function getIntegrationState(args: {
  enabled: boolean;
  effectiveApp: EffectiveMcpApp | null;
  fallbackAuthType?: string | null;
  fallbackSetupStatus?: string | null;
  fallbackNotLiveReason?: string | null;
  isResolvingCanonicalState?: boolean;
}): {
  stateLabel: string;
  stateTone: IntegrationSurfaceStateTone;
} {
  if (!args.enabled) return { stateLabel: "Disabled", stateTone: "disabled" };
  if (args.effectiveApp?.live_for_current_user) {
    return { stateLabel: "Live", stateTone: "live" };
  }
  if (args.fallbackSetupStatus === "needs_auth") {
    return { stateLabel: "Needs auth", stateTone: "setup" };
  }
  if (args.fallbackSetupStatus === "needs_config") {
    return { stateLabel: "Needs config", stateTone: "setup" };
  }
  if (args.fallbackSetupStatus === "needs_runtime") {
    return { stateLabel: "Needs runtime", stateTone: "setup" };
  }
  if (args.effectiveApp?.credential_state === "needs_personal_setup") {
    return { stateLabel: "Setup needed", stateTone: "setup" };
  }
  if (args.effectiveApp?.credential_state === "not_live") {
    return { stateLabel: "Not live", stateTone: "not-live" };
  }
  if (args.isResolvingCanonicalState) {
    return { stateLabel: "Checking", stateTone: "attached" };
  }
  if (args.fallbackNotLiveReason === "needs_config") {
    return { stateLabel: "Needs config", stateTone: "setup" };
  }
  if (args.fallbackNotLiveReason === "needs_runtime") {
    return { stateLabel: "Needs runtime", stateTone: "setup" };
  }
  if (args.fallbackAuthType && args.fallbackAuthType !== "none") {
    return { stateLabel: "Setup needed", stateTone: "setup" };
  }
  return { stateLabel: "Added", stateTone: "attached" };
}

export function findEffectiveMcpAppForCommunityMount(
  mount: CommunityMountedApp,
  apps: EffectiveMcpApp[],
): EffectiveMcpApp | null {
  const aliases = new Set(buildMcpAppIdentityAliases(mount));
  return (
    apps.find((app) => aliases.has(app.app_identity_key)) ??
    apps.find((app) => mcpAppIdentitySourcesOverlap(app, mount)) ??
    null
  );
}

export function buildIntegrationSurfaceRowFromEffectiveApp(
  effectiveApp: EffectiveMcpApp,
  options: {
    canToggle?: boolean;
    canSetup?: boolean;
    isBusy?: boolean;
    enabled?: boolean;
  } = {},
): IntegrationSurfaceRow {
  const catalogEntry = findDiscoverCatalogEntryForAppIdentity(effectiveApp.app);
  const enabled =
    options.enabled ??
    effectiveApp.personal_mount?.enabled ??
    effectiveApp.community_mount?.enabled ??
    true;
  const toolNames = getIntegrationToolNames({ effectiveApp });
  const state = getIntegrationState({
    enabled,
    effectiveApp,
    fallbackAuthType: effectiveApp.app.auth_type,
  });
  return {
    id: effectiveApp.app_identity_key,
    appIdentityKey: effectiveApp.app_identity_key,
    name: effectiveApp.app.name.trim() || "Connected app",
    logoUrl: catalogEntry?.logoUrl ?? null,
    logoUrlDark: catalogEntry?.logoUrlDark ?? null,
    stateLabel: state.stateLabel,
    stateTone: state.stateTone,
    toolCountLabel: pluralizeIntegrationTools(toolNames.length),
    toolNames,
    enabled,
    canToggle: options.canToggle ?? false,
    canSetup: options.canSetup ?? (effectiveApp.primary_action === "setup_personal"),
    isBusy: options.isBusy ?? false,
    effectiveApp,
    communityMount: effectiveApp.community_mount,
  };
}

export function buildIntegrationSurfaceRowFromCommunityMount(
  mount: CommunityMountedApp,
  effectiveApps: EffectiveMcpApp[],
  options: {
    canToggle?: boolean;
    canSetup?: boolean;
    isBusy?: boolean;
    isResolvingCanonicalState?: boolean;
  } = {},
): IntegrationSurfaceRow {
  const effectiveApp = findEffectiveMcpAppForCommunityMount(mount, effectiveApps);
  const catalogEntry = findDiscoverCatalogEntryForAppIdentity(
    effectiveApp?.app ?? mount.app,
  );
  const aliases = buildMcpAppIdentityAliases(mount);
  const appIdentityKey = effectiveApp?.app_identity_key ?? aliases[0] ?? mount.id;
  const toolNames = getIntegrationToolNames({ effectiveApp, communityMount: mount });
  const state = getIntegrationState({
    enabled: mount.enabled,
    effectiveApp,
    fallbackAuthType: mount.app.auth_type,
    fallbackSetupStatus: mount.app.setup_status,
    fallbackNotLiveReason: mount.not_live_reason,
    isResolvingCanonicalState: options.isResolvingCanonicalState,
  });
  return {
    id: mount.id,
    appIdentityKey,
    name: mount.app.name.trim() || mount.app.slug.trim() || "Connected app",
    logoUrl: catalogEntry?.logoUrl ?? null,
    logoUrlDark: catalogEntry?.logoUrlDark ?? null,
    stateLabel: state.stateLabel,
    stateTone: state.stateTone,
    toolCountLabel: pluralizeIntegrationTools(toolNames.length),
    toolNames,
    enabled: mount.enabled,
    canToggle: options.canToggle ?? false,
    canSetup:
      options.canSetup ??
      (!effectiveApp?.live_for_current_user &&
        (effectiveApp?.primary_action === "setup_personal" ||
          mount.app.setup_status === "needs_auth" ||
          mount.app.setup_status === "needs_config" ||
          (mount.app.auth_type !== "none" && !effectiveApp?.has_personal_mount))),
    isBusy: options.isBusy ?? false,
    effectiveApp,
    communityMount: mount,
  };
}

export function buildCommunityIntegrationSurfaceRows(
  mounts: CommunityMountedApp[],
  effectiveApps: EffectiveMcpApp[],
  options: {
    canToggle?: boolean;
    busyMountIds?: Set<string>;
    isResolvingCanonicalState?: boolean;
    limit?: number;
  } = {},
): IntegrationSurfaceRow[] {
  const seen = new Set<string>();
  const rows: IntegrationSurfaceRow[] = [];
  for (const mount of mounts) {
    const row = buildIntegrationSurfaceRowFromCommunityMount(mount, effectiveApps, {
      canToggle: options.canToggle,
      isBusy: options.busyMountIds?.has(mount.id) ?? false,
      isResolvingCanonicalState: options.isResolvingCanonicalState,
    });
    const dedupeKey = row.appIdentityKey || row.name;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    rows.push(row);
    if (options.limit && rows.length >= options.limit) break;
  }
  return rows;
}
