import {
  buildCommunityOverlayRuntimeState,
} from "../shared/communityOverlayRuntime.ts";
import { buildPersonalSkillOverlayRuntimeState } from "../shared/personalSkillOverlayRuntime.ts";
import type { RuntimeMountedMcpTool } from "./runtimeMcpManager.ts";
import {
  buildUserPlatformMountedAppsPromptBlock,
  mapCommunitySkillsToOverlayRuntime,
  mapSelectedCommunitySkillsToOverlayRuntime,
  mapSelectedUserPlatformSkillsToOverlayRuntime,
  mapUserPlatformSkillsToOverlayRuntime,
  type RuntimeCommunitySkillInventory,
  type RuntimeSelectedCommunitySkill,
  type RuntimeSelectedUserPlatformSkill,
  type RuntimeSkillResolution,
  type RuntimeUserPlatformSkillInventory,
} from "./runtimeHarnessShaping.ts";

export type ResolvedCommunityHarnessModule = {
  attachedSkills: RuntimeCommunitySkillInventory[];
  selectedSkills: RuntimeSelectedCommunitySkill[];
  systemPromptSuffix: string;
};

export type ResolvedEffectiveHarness = {
  personalMountedTools: RuntimeMountedMcpTool[];
  personalSkillInventory: RuntimeUserPlatformSkillInventory[];
  selectedPersonalSkills: RuntimeSelectedUserPlatformSkill[];
  activeCommunityModule: ResolvedCommunityHarnessModule | null;
  runtimeMountedTools: RuntimeMountedMcpTool[];
  discoveryMountedTools: RuntimeMountedMcpTool[];
  shadowedMountedTools: RuntimeMountedMcpTool[];
  capabilityGroups: EffectiveMountedToolCapabilityGroup[];
  shadowedRuntimeToolNames: string[];
  requestedSkillMentionTokens: string[];
  ambiguousSkillMentionTokens: string[];
  systemPromptSuffix: string;
};

export type EffectiveMountedToolCapabilityGroup = {
  capability_key: string;
  app_name: string;
  catalog_app_id: string | null;
  endpoint_url: string;
  auth_type: string;
  scopes: Array<"user" | "community">;
  default_scope: "user" | "community";
  tool_count: number;
  default_runtime_tool_names: string[];
  executable_runtime_tool_names: string[];
};

export type ResolvedEffectiveMountedToolCatalog = {
  executableTools: RuntimeMountedMcpTool[];
  defaultDiscoveryTools: RuntimeMountedMcpTool[];
  shadowedTools: RuntimeMountedMcpTool[];
  shadowedRuntimeToolNames: string[];
  capabilityGroups: EffectiveMountedToolCapabilityGroup[];
};

export function buildAmbiguousSkillMentionsPromptBlock(
  mentionTokens: string[],
): string {
  if (mentionTokens.length === 0) return "";
  return [
    "",
    "Some explicitly mentioned skill tokens were ambiguous across active scopes, so no skill instructions were loaded for them this turn.",
    `Ambiguous tokens: ${mentionTokens.map((token) => `$${token}`).join(", ")}`,
    "If the user still wants one of these skills, ask them to clarify which scope they mean.",
  ].join("\n");
}

function normalizeMountedToolDuplicateKeyPart(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function buildMountedToolCapabilityKey(tool: RuntimeMountedMcpTool): string {
  const normalizedCatalogAppId = normalizeMountedToolDuplicateKeyPart(
    tool.catalog_app_id,
  );
  if (normalizedCatalogAppId) return `catalog:${normalizedCatalogAppId}`;

  const normalizedEndpointUrl = normalizeMountedToolDuplicateKeyPart(
    tool.endpoint_url,
  );
  const normalizedAuthType = normalizeMountedToolDuplicateKeyPart(
    tool.auth_type,
  );
  if (normalizedEndpointUrl && normalizedAuthType) {
    return `endpoint:${normalizedEndpointUrl}:auth:${normalizedAuthType}`;
  }

  const normalizedAppName =
    normalizeMountedToolDuplicateKeyPart(tool.app_name) || "app";
  const normalizedDeveloperAppId = normalizeMountedToolDuplicateKeyPart(
    tool.developer_app_id,
  );
  return normalizedDeveloperAppId
    ? `developer:${normalizedDeveloperAppId}`
    : `app:${normalizedAppName}`;
}

export function buildMountedToolDuplicateKeys(
  tool: RuntimeMountedMcpTool,
): string[] {
  const duplicateKeys = new Set<string>();
  const normalizedToolName = normalizeMountedToolDuplicateKeyPart(
    tool.tool_name,
  );
  if (!normalizedToolName) return [];

  const normalizedCatalogAppId = normalizeMountedToolDuplicateKeyPart(
    tool.catalog_app_id,
  );
  if (normalizedCatalogAppId) {
    duplicateKeys.add(
      `catalog:${normalizedCatalogAppId}:tool:${normalizedToolName}`,
    );
  }

  const normalizedEndpointUrl = normalizeMountedToolDuplicateKeyPart(
    tool.endpoint_url,
  );
  const normalizedAuthType = normalizeMountedToolDuplicateKeyPart(
    tool.auth_type,
  );
  if (normalizedEndpointUrl && normalizedAuthType) {
    duplicateKeys.add(
      `endpoint:${normalizedEndpointUrl}:auth:${normalizedAuthType}:tool:${normalizedToolName}`,
    );
  }

  return [...duplicateKeys];
}

export function buildEffectiveMountedToolDiscoveryCatalog(
  mountedTools: RuntimeMountedMcpTool[],
): {
  discoveryMountedTools: RuntimeMountedMcpTool[];
  shadowedMountedTools: RuntimeMountedMcpTool[];
  shadowedRuntimeToolNames: string[];
} {
  const discoveryMountedTools: RuntimeMountedMcpTool[] = [];
  const shadowedMountedTools: RuntimeMountedMcpTool[] = [];
  const shadowedRuntimeToolNames: string[] = [];
  const claimedDuplicateKeys = new Set<string>();

  const appendToolIfVisible = (tool: RuntimeMountedMcpTool) => {
    const duplicateKeys = buildMountedToolDuplicateKeys(tool);
    if (duplicateKeys.some((key) => claimedDuplicateKeys.has(key))) {
      shadowedMountedTools.push(tool);
      shadowedRuntimeToolNames.push(tool.runtime_tool_name);
      return;
    }
    discoveryMountedTools.push(tool);
    for (const key of duplicateKeys) {
      claimedDuplicateKeys.add(key);
    }
  };

  for (const tool of mountedTools.filter((tool) => tool.scope === "community")) {
    appendToolIfVisible(tool);
  }
  for (const tool of mountedTools.filter((tool) => tool.scope === "user")) {
    appendToolIfVisible(tool);
  }

  return {
    discoveryMountedTools,
    shadowedMountedTools,
    shadowedRuntimeToolNames,
  };
}

function buildEffectiveMountedToolCapabilityGroups(args: {
  executableTools: RuntimeMountedMcpTool[];
  defaultDiscoveryTools: RuntimeMountedMcpTool[];
}): EffectiveMountedToolCapabilityGroup[] {
  const defaultToolNames = new Set(
    args.defaultDiscoveryTools.map((tool) => tool.runtime_tool_name),
  );
  const groups = new Map<
    string,
    {
      appName: string;
      catalogAppId: string | null;
      endpointUrl: string;
      authType: string;
      scopes: Set<"user" | "community">;
      defaultScopes: Set<"user" | "community">;
      executableToolNames: Set<string>;
      defaultToolNames: Set<string>;
    }
  >();

  for (const tool of args.executableTools) {
    const key = buildMountedToolCapabilityKey(tool);
    const group =
      groups.get(key) ??
      {
        appName: tool.app_name,
        catalogAppId: tool.catalog_app_id,
        endpointUrl: tool.endpoint_url,
        authType: tool.auth_type,
        scopes: new Set<"user" | "community">(),
        defaultScopes: new Set<"user" | "community">(),
        executableToolNames: new Set<string>(),
        defaultToolNames: new Set<string>(),
      };
    group.scopes.add(tool.scope);
    group.executableToolNames.add(tool.runtime_tool_name);
    if (defaultToolNames.has(tool.runtime_tool_name)) {
      group.defaultScopes.add(tool.scope);
      group.defaultToolNames.add(tool.runtime_tool_name);
    }
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([capabilityKey, group]) => {
      const scopes = [...group.scopes].sort((left, right) =>
        left.localeCompare(right),
      );
      const defaultScope = group.defaultScopes.has("community")
        ? "community"
        : "user";
      return {
        capability_key: capabilityKey,
        app_name: group.appName,
        catalog_app_id: group.catalogAppId,
        endpoint_url: group.endpointUrl,
        auth_type: group.authType,
        scopes,
        default_scope: defaultScope,
        tool_count: group.executableToolNames.size,
        default_runtime_tool_names: [...group.defaultToolNames].sort(),
        executable_runtime_tool_names: [...group.executableToolNames].sort(),
      } satisfies EffectiveMountedToolCapabilityGroup;
    })
    .sort((left, right) => left.capability_key.localeCompare(right.capability_key));
}

export function resolveEffectiveMountedToolCatalog(
  mountedTools: RuntimeMountedMcpTool[],
): ResolvedEffectiveMountedToolCatalog {
  const executableTools = [...mountedTools];
  const {
    discoveryMountedTools: defaultDiscoveryTools,
    shadowedMountedTools: shadowedTools,
    shadowedRuntimeToolNames,
  } = buildEffectiveMountedToolDiscoveryCatalog(executableTools);
  return {
    executableTools,
    defaultDiscoveryTools,
    shadowedTools,
    shadowedRuntimeToolNames,
    capabilityGroups: buildEffectiveMountedToolCapabilityGroups({
      executableTools,
      defaultDiscoveryTools,
    }),
  };
}

export function composeResolvedRuntimeHarness(args: {
  personalMountedTools: RuntimeMountedMcpTool[];
  skillResolution: RuntimeSkillResolution;
}): ResolvedEffectiveHarness {
  const personalSkillInventory = args.skillResolution.user_platform_skill_inventory;
  const selectedPersonalSkills =
    args.skillResolution.selected_user_platform_skills;
  const attachedCommunitySkills = args.skillResolution.community_skill_inventory;
  const selectedCommunitySkills =
    args.skillResolution.selected_community_skills;

  const personalSkillRuntimeState = buildPersonalSkillOverlayRuntimeState({
    installedSkills: mapUserPlatformSkillsToOverlayRuntime(
      personalSkillInventory,
    ),
    selectedSkills: mapSelectedUserPlatformSkillsToOverlayRuntime(
      selectedPersonalSkills,
    ),
  });

  const activeCommunityModule =
    attachedCommunitySkills.length > 0 || selectedCommunitySkills.length > 0
      ? (() => {
          const overlayRuntimeState = buildCommunityOverlayRuntimeState({
            attachedSkills: mapCommunitySkillsToOverlayRuntime(
              attachedCommunitySkills,
            ),
            selectedSkills: mapSelectedCommunitySkillsToOverlayRuntime(
              selectedCommunitySkills,
            ),
          });
          return {
            attachedSkills: attachedCommunitySkills,
            selectedSkills: selectedCommunitySkills,
            systemPromptSuffix: overlayRuntimeState.systemPromptSuffix,
          } satisfies ResolvedCommunityHarnessModule;
        })()
      : null;

  const runtimeMountedTools = [...args.personalMountedTools];
  const resolvedMountedToolCatalog =
    resolveEffectiveMountedToolCatalog(runtimeMountedTools);

  return {
    personalMountedTools: args.personalMountedTools,
    personalSkillInventory,
    selectedPersonalSkills,
    activeCommunityModule,
    runtimeMountedTools: resolvedMountedToolCatalog.executableTools,
    discoveryMountedTools: resolvedMountedToolCatalog.defaultDiscoveryTools,
    shadowedMountedTools: resolvedMountedToolCatalog.shadowedTools,
    capabilityGroups: resolvedMountedToolCatalog.capabilityGroups,
    shadowedRuntimeToolNames:
      resolvedMountedToolCatalog.shadowedRuntimeToolNames,
    requestedSkillMentionTokens:
      args.skillResolution.requested_mention_tokens,
    ambiguousSkillMentionTokens:
      args.skillResolution.ambiguous_mention_tokens,
    systemPromptSuffix: `${buildUserPlatformMountedAppsPromptBlock(
      args.personalMountedTools,
    )}${personalSkillRuntimeState.systemPromptSuffix}${buildAmbiguousSkillMentionsPromptBlock(
      args.skillResolution.ambiguous_mention_tokens,
    )}${activeCommunityModule?.systemPromptSuffix ?? ""}`,
  };
}
