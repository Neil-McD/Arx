import {
  buildCommunityOverlayRuntimeState,
} from "../shared/communityOverlayRuntime.ts";
import { buildPersonalSkillOverlayRuntimeState } from "../shared/personalSkillOverlayRuntime.ts";
import type { RuntimeMountedMcpTool } from "./runtimeMcpManager.ts";
import {
  buildUserPlatformMountedAppsPromptBlock,
  mapCommunitySkillsToOverlayRuntime,
  mapMountedToolsToOverlayRuntime,
  mapSelectedCommunitySkillsToOverlayRuntime,
  mapSelectedUserPlatformSkillsToOverlayRuntime,
  mapUserPlatformSkillsToOverlayRuntime,
  type RuntimeMountedCommunityAppTool,
  type RuntimeCommunitySkillInventory,
  type RuntimeSelectedCommunitySkill,
  type RuntimeSelectedUserPlatformSkill,
  type RuntimeSkillResolution,
  type RuntimeUserPlatformSkillInventory,
} from "./runtimeHarnessShaping.ts";

export type ResolvedCommunityHarnessModule = {
  mountedTools: RuntimeMountedCommunityAppTool[];
  runtimeMountedTools: RuntimeMountedMcpTool[];
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
  shadowedRuntimeToolNames: string[];
  requestedSkillMentionTokens: string[];
  ambiguousSkillMentionTokens: string[];
  systemPromptSuffix: string;
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
  shadowedRuntimeToolNames: string[];
} {
  const discoveryMountedTools: RuntimeMountedMcpTool[] = [];
  const shadowedRuntimeToolNames: string[] = [];
  const claimedDuplicateKeys = new Set<string>();

  const appendToolIfVisible = (tool: RuntimeMountedMcpTool) => {
    const duplicateKeys = buildMountedToolDuplicateKeys(tool);
    if (duplicateKeys.some((key) => claimedDuplicateKeys.has(key))) {
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
    shadowedRuntimeToolNames,
  };
}

export function composeResolvedRuntimeHarness(args: {
  personalMountedTools: RuntimeMountedMcpTool[];
  communityMountedTools: RuntimeMountedCommunityAppTool[];
  runtimeMountedCommunityTools: RuntimeMountedMcpTool[];
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
    args.communityMountedTools.length > 0 ||
    attachedCommunitySkills.length > 0 ||
    selectedCommunitySkills.length > 0
      ? (() => {
          const overlayRuntimeState = buildCommunityOverlayRuntimeState({
            mountedTools: mapMountedToolsToOverlayRuntime(
              args.communityMountedTools,
            ),
            attachedSkills: mapCommunitySkillsToOverlayRuntime(
              attachedCommunitySkills,
            ),
            selectedSkills: mapSelectedCommunitySkillsToOverlayRuntime(
              selectedCommunitySkills,
            ),
          });
          return {
            mountedTools: args.communityMountedTools,
            runtimeMountedTools: args.runtimeMountedCommunityTools,
            attachedSkills: attachedCommunitySkills,
            selectedSkills: selectedCommunitySkills,
            systemPromptSuffix: overlayRuntimeState.systemPromptSuffix,
          } satisfies ResolvedCommunityHarnessModule;
        })()
      : null;

  const runtimeMountedTools = [
    ...args.personalMountedTools,
    ...(activeCommunityModule?.runtimeMountedTools ?? []),
  ];
  const { discoveryMountedTools, shadowedRuntimeToolNames } =
    buildEffectiveMountedToolDiscoveryCatalog(runtimeMountedTools);

  return {
    personalMountedTools: args.personalMountedTools,
    personalSkillInventory,
    selectedPersonalSkills,
    activeCommunityModule,
    runtimeMountedTools,
    discoveryMountedTools,
    shadowedRuntimeToolNames,
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
